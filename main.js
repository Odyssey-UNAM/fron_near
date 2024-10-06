// 1. Configurar la escena, la cámara y el renderizador
const scene = new THREE.Scene();

// Importar la textura para el fondo
const loader = new THREE.TextureLoader();
loader.load('2k_stars_milky_way.jpg', function(texture) {
    // Asignar la textura como fondo de la escena
    scene.background = texture;
});

const camera = new THREE.PerspectiveCamera(
    75, // Campo de visión
    window.innerWidth / window.innerHeight, // Relación de aspecto
    0.1, // Plano cercano
    1000 // Plano lejano
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Habilitar sombras en el renderizador
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Añadir iluminación a la escena
// Luz direccional para simular el Sol
const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(10, 10, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

// Añadir una luz puntual
const pointLight = new THREE.PointLight(0xffffff, 1, 500);
pointLight.position.set(0, 0, 0);
pointLight.castShadow = true;
scene.add(pointLight);

// Luz ambiental suave
const ambientLight = new THREE.AmbientLight(0x333333); // Luz ambiental tenue
scene.add(ambientLight);

// Parámetro gravitacional estándar (para unidades UA y días)
const mu = 0.01720209895 * 0.01720209895; // (UA^3 / día^2)

// Variables globales para interactividad
const clickableObjects = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Añadir el evento de movimiento del mouse al renderer
renderer.domElement.addEventListener('mousemove', onMouseMove, true);

// Variable global para almacenar el objeto intersectado
let INTERSECTED = null;

// Función para convertir elementos keplerianos a coordenadas cartesianas
function keplerianToCartesian(orbitalElements, mu) {
    const {
        semi_major_axis: a,
        eccentricity: e,
        inclination: i,
        ascending_node_longitude: omega,
        perihelion_argument: w,
        mean_anomaly: M
    } = orbitalElements;

    // Convertir grados a radianes
    const degToRad = Math.PI / 180;
    const I = i * degToRad;
    const Ω = omega * degToRad;
    const ω = w * degToRad;
    const M_rad = M * degToRad;

    // Resolver la ecuación de Kepler para obtener la anomalía excéntrica E
    let E = M_rad;
    let delta = 1;
    while (delta > 1e-6) {
        const E_next = E - (E - e * Math.sin(E) - M_rad) / (1 - e * Math.cos(E));
        delta = Math.abs(E_next - E);
        E = E_next;
    }

    // Calcular la posición en el plano orbital
    const x_orb = a * (Math.cos(E) - e);
    const y_orb = a * Math.sqrt(1 - e * e) * Math.sin(E);

    // Matrices de rotación
    const cosΩ = Math.cos(Ω);
    const sinΩ = Math.sin(Ω);
    const cosI = Math.cos(I);
    const sinI = Math.sin(I);
    const cosω = Math.cos(ω);
    const sinω = Math.sin(ω);

    const x =
        (cosΩ * cosω - sinΩ * sinω * cosI) * x_orb +
        (-cosΩ * sinω - sinΩ * cosω * cosI) * y_orb;
    const y =
        (sinΩ * cosω + cosΩ * sinω * cosI) * x_orb +
        (-sinΩ * sinω + cosΩ * cosω * cosI) * y_orb;
    const z = (sinω * sinI) * x_orb + (cosω * sinI) * y_orb;

    return new THREE.Vector3(x, y, z);
}

// Función para generar los puntos de la órbita
function generateOrbitPoints(orbitalElements, mu, segments = 360) {
    const points = [];
    for (let M = 0; M < 360; M += 360 / segments) {
        const updatedElements = { ...orbitalElements, mean_anomaly: M };
        const position = keplerianToCartesian(updatedElements, mu);
        points.push(position);
    }
    // Añadir el primer punto al final para cerrar la órbita
    points.push(points[0]);
    return points;
}

// Función para obtener la lista de objetos cercanos a la Tierra
async function fetchNearEarthObjects(date) {
    console.log('Fecha:', date);
    const apiUrl = `https://backnear-production.up.railway.app/data?date=${date}`;
    try {
        console.log('URL:', apiUrl);
        const response = await fetch(apiUrl);
        console.log('Respuesta:', response);
        const data = await response.json();
        console.log('Datos obtenidos:', data);
        return data.data; // Asumiendo que 'data' es el array de objetos
    } catch (error) {
        console.error('Error al obtener los objetos cercanos a la Tierra:', error);
        return [];
    }
}

// Función para obtener los datos orbitales de un objeto dado su ID
async function fetchOrbitalData(id) {
    const objectUrl = `https://backnear-production.up.railway.app/orbital-data/${id}`;
    try {
        const response = await fetch(objectUrl);
        const data = await response.json();
        return data; // Asumiendo que 'data' contiene directamente los datos orbitales
    } catch (error) {
        console.error(`Error al obtener los datos orbitales para el ID ${id}:`, error);
        return null;
    }
}

// Función principal para cargar y visualizar los objetos
async function loadAndVisualizeObjects() {
    const date = '2024-08-5'; // Puedes obtener la fecha actual o permitir al usuario elegirla
    const objects = await fetchNearEarthObjects(date);

    console.log(`Se encontraron ${objects.length} objetos cercanos a la Tierra.`);
    if (objects.length === 0) {
        console.error('No se encontraron objetos para visualizar.');
        return;
    }

    for (const obj of objects) {
        const id = obj.id; // Asegúrate de que este es el campo correcto
        const orbitalData = await fetchOrbitalData(id);
        if (!orbitalData) continue;

        // Mapear los campos de los datos orbitales a los nombres esperados
        const orbitalElements = {
            name: obj.name || `Objeto ${id}`,
            semi_major_axis: parseFloat(orbitalData.semi_major_axis), // a en UA
            eccentricity: parseFloat(orbitalData.eccentricity), // e
            inclination: parseFloat(orbitalData.inclination), // i en grados
            ascending_node_longitude: parseFloat(orbitalData.ascending_node_longitude), // Ω en grados
            perihelion_argument: parseFloat(orbitalData.perihelion_argument), // ω en grados
            mean_anomaly: parseFloat(orbitalData.mean_anomaly) // M en grados
        };

        // Verificar que todos los campos necesarios están presentes
        if (
            isNaN(orbitalElements.semi_major_axis) ||
            isNaN(orbitalElements.eccentricity) ||
            isNaN(orbitalElements.inclination) ||
            isNaN(orbitalElements.ascending_node_longitude) ||
            isNaN(orbitalElements.perihelion_argument) ||
            isNaN(orbitalElements.mean_anomaly)
        ) {
            console.warn(`Datos orbitales incompletos para el objeto ID ${id}`);
            continue;
        }

        // Generar los puntos de la órbita
        const orbitPoints = generateOrbitPoints(orbitalElements, mu);

        // Crear la geometría y el material
        const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
        const orbitMaterial = new THREE.LineBasicMaterial({
            color: Math.random() * 0xffffff, // Color aleatorio para cada órbita
            linewidth: 1
        });

        // Crear la línea y añadirla a la escena
        const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
        scene.add(orbitLine);

        // Añadir una esfera en la posición actual del objeto
        const currentPosition = keplerianToCartesian(orbitalElements, mu);
        const sphereGeometry = new THREE.SphereGeometry(0.05, 14, 16);
        const textureLoader = new THREE.TextureLoader();
        const sphereTexture = textureLoader.load('asteroid.jpeg');
        const sphereMaterial = new THREE.MeshPhongMaterial({
            map: sphereTexture
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.copy(currentPosition);
        scene.add(sphere);

        // Almacenar referencia a la esfera y sus datos para interacción
        sphere.userData = {
            orbitalElements: orbitalElements,
            id: id,
            name: obj.name || `Objeto ${id}`,
            // Puedes agregar más información si lo deseas
        };
        clickableObjects.push(sphere);
    }
    console.log('Objetos cargados y visualizados con éxito.');
}

// Ejecutar la función principal
loadAndVisualizeObjects();
console.log('Cargando objetos...');

// Cargar las texturas de día y de noche
const textureLoader = new THREE.TextureLoader();
const earthDayTexture = textureLoader.load('2k_earth_daymap.jpg');
const earthNightTexture = textureLoader.load('2k_earth_nightmap.jpg');

// Crear el material combinando ambas texturas
const earthMaterial = new THREE.MeshPhongMaterial({
    map: earthDayTexture,
    emissiveMap: earthNightTexture,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1,
});

// Crear la geometría y la malla de la Tierra
const earthGeometry = new THREE.SphereGeometry(0.2, 32, 32);
const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earthMesh);

// Posicionar la cámara inicialmente
camera.position.z = 5;
camera.position.y = 2;
camera.lookAt(new THREE.Vector3(0, 0, 0));

// Añadir controles de órbita
let controls;
if (typeof THREE.OrbitControls !== 'undefined') {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Para movimiento suave
    controls.dampingFactor = 0.05;
    controls.autoRotate = false; // Deshabilita la rotación automática si deseas controlar el movimiento manualmente
}

// Variables para controlar el movimiento de la cámara
let angle = 0;
const radius = 5; // Distancia desde el centro

// Variables para controlar si el mouse se ha movido
let mouseMoved = false;
let cursorEvent;

// Función de animación
function animate() {
    requestAnimationFrame(animate);

    // Actualizar el ángulo para el movimiento de la cámara
    angle += 0.005; // Ajusta este valor para cambiar la velocidad

    // Calcular la nueva posición de la cámara
    camera.position.x = radius * Math.cos(angle);
    camera.position.z = radius * Math.sin(angle);

    // Asegurarse de que la cámara siempre mire al centro
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    // Rotar la Tierra sobre su eje Y
    earthMesh.rotation.y += 0.001; // Ajusta la velocidad de rotación según necesites

    // Actualizar los controles si están habilitados
    if (controls) controls.update();

    // Si el mouse se ha movido, actualizar el raycaster
    if (mouseMoved) {
        // Actualizar el raycaster con la posición del mouse y la cámara
        raycaster.setFromCamera(mouse, camera);

        // Calcular los objetos que intersectan con el rayo
        const intersects = raycaster.intersectObjects(clickableObjects);

        if (intersects.length > 0) {
            const intersectedObject = intersects[0].object;

            if (INTERSECTED !== intersectedObject) {
                INTERSECTED = intersectedObject;

                // Acceder a los datos almacenados en el objeto
                const data = INTERSECTED.userData;

                // Mostrar la información en el cuadro de diálogo
                const infoBox = document.getElementById('infoBox');
                const infoContent = document.getElementById('infoContent');

                // Formatear la información en HTML
                infoContent.innerHTML = `
                    <strong>Objeto:</strong> ${data.name}<br>
                    <strong>ID:</strong> ${data.id}<br>
                    <strong>Elementos orbitales:</strong><br>
                    <pre>${JSON.stringify(data.orbitalElements, null, 2)}</pre>
                `;

                // Mostrar el cuadro de información
                infoBox.style.display = 'block';
            }

            // Actualizar la posición del cuadro de información cerca del cursor
            const infoBox = document.getElementById('infoBox');
            infoBox.style.left = `${cursorEvent.clientX + 15}px`;
            infoBox.style.top = `${cursorEvent.clientY + 15}px`;
        } else {
            // No hacemos nada; el infoBox permanece visible y en su posición actual
            // Si deseas ocultar el infoBox cuando se hace clic fuera de los objetos, puedes agregar un evento adicional
        }

        mouseMoved = false;
    }

    renderer.render(scene, camera);
}
animate();

// Ajustar el renderizado al redimensionar la ventana
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
}

// Función para manejar el movimiento del mouse y mostrar información en el cuadro de diálogo
function onMouseMove(event) {
    event.preventDefault();

    // Obtener el rectángulo del canvas para calcular las coordenadas correctas
    const rect = renderer.domElement.getBoundingClientRect();

    // Convertir las coordenadas del mouse a coordenadas normalizadas del dispositivo (-1 a +1)
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Guardar el evento para usar la posición del cursor
    cursorEvent = event;

    mouseMoved = true;
}

// Manejador para cerrar el cuadro de diálogo cuando se haga clic en el botón de cerrar
document.getElementById('closeButton').addEventListener('click', function () {
    document.getElementById('infoBox').style.display = 'none';
    INTERSECTED = null;
});