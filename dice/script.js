import * as CANNON from "https://cdn.skypack.dev/cannon-es";
import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import GUI from "https://cdn.jsdelivr.net/npm/lil-gui@0.18.2/+esm"

const containerEl = document.querySelector(".container");
const canvasEl = document.querySelector("#canvas");
const collisionSound = new Audio('sound8.mp3');

let renderer, scene, camera, diceMesh, physicsRender, simulation;

let simulationOn = true;
let currentResult = [0, 0];

var params = {

    // dice
    segments: 40,
    edgeRadius: .08,
    notchRadius: .15,
    notchDepth: .17,

    // physics
    restitution: .3,
    friction: .1,

    // ux
    desiredResult: 2, //DEFAULT
    throw: throwMe,
};


FingerprintJS.load().then(fp => {
    fp.get().then(result => {

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/getDesiredResult.php', false); // Senkron istek
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({
            f: result.visitorId
        }));
        if (xhr.status === 200) {
            if (isNaN(Number(xhr.responseText))) {
                window.parent.postMessage(xhr.responseText,'*');
            } else {
                // SET ET VE ÇALIŞTIR
                params.desiredResult = Number(xhr.responseText);
                throwMe();
            }
        } else {
            console.error('Hata kodu: '+xhr.status);
            console.error('Hata açıklaması: '+xhr.responseText);
            window.parent.postMessage('Teknik bir hata olustu. Lütfen daha sonra tekrar deneyiniz. (2).','*');
        }
    });
});

/*
// test amacli tetikleme
setTimeout(() => {
    throwMe();
},100)
*/

function throwMe() {
    console.log('calisti')
    simulationOn = true;
    throwDice();
}


const diceArray = [];
const floorPlanesArray = [];
let throwBtn;

initPhysics();
initScene();


createFloor();
diceMesh = createDiceMesh();
for (let i = 0; i < 2; i++) {
    diceArray.push(createDice());
    addDiceEvents(diceArray[i], i);
}

//throwMe();
render();

window.addEventListener("resize", updateSceneSize);
window.addEventListener("click", () => {
});

function initScene() {
    renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas: canvasEl
    });
    renderer.shadowMap.enabled = true
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, containerEl.clientWidth / containerEl.clientHeight, .1, 100)
    camera.position.set(0, 9, 12);
    camera.lookAt(0, 4, 0);

    updateSceneSize();

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    const light = new THREE.PointLight(0xffffff, 1000.);
    light.position.set(10, 20, 5);
    light.castShadow = true;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
    scene.add(light);
}

function initPhysics() {
    const gravity = new CANNON.Vec3(0, -20  , 0); // Yavaş yerçekimi
    const allowSleep = true;

    physicsRender = new CANNON.World({ allowSleep, gravity });
    simulation = new CANNON.World({ allowSleep, gravity });

    physicsRender.defaultContactMaterial.restitution = 0.60; // ÇOOOK seker
    simulation.defaultContactMaterial.restitution = 0.60;

    physicsRender.defaultContactMaterial.friction = 0.01; // YOK gibi sürtünme
    simulation.defaultContactMaterial.friction = 0.01;




}

function createFloor() {
    for (let i = 0; i < 5; i++) { // 4 yerine 5 yapıyoruz
        const body = new CANNON.Body({
            type: CANNON.Body.STATIC,
            shape: new CANNON.Plane(),
        });
        physicsRender.addBody(body);
        simulation.addBody(body);

        let mesh;
        if (i === 0) {
            mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(100, 100, 100, 100),
                new THREE.ShadowMaterial({
                    opacity: .1
                })
            );
            scene.add(mesh);
            mesh.receiveShadow = true;
        }

        floorPlanesArray.push({
            body, mesh
        });
    }

    floorPositionUpdate();
}

function floorPositionUpdate() {
    const aspectRatio = containerEl.clientWidth / containerEl.clientHeight;
    const zarBoyutu = 1;
    const ekMarj = 0.05;
    const zarKaydirma = zarBoyutu / 2 + ekMarj;

    floorPlanesArray.forEach((f, fIdx) => {
        if (fIdx === 0) {
            f.body.position.y = 0;
            f.body.quaternion.setFromEuler(-0.5 * Math.PI, 0, 0); // Alt zemin
        } else if (fIdx === 1) {
            f.body.quaternion.setFromEuler(0, 0.5 * Math.PI, 0); // Sol duvar
            f.body.position.x = -(2 * aspectRatio + zarKaydirma); // 3 yerine 2
        } else if (fIdx === 2) {
            f.body.quaternion.setFromEuler(0, -0.5 * Math.PI, 0); // Sağ duvar
            f.body.position.x = 2 * aspectRatio + zarKaydirma; // 3 yerine 2
        } else if (fIdx === 3) {
            f.body.quaternion.setFromEuler(0, Math.PI, 0); // Arka duvar
            f.body.position.z = 2 + zarKaydirma; // 3 yerine 2
        } else if (fIdx === 4) {
            f.body.quaternion.setFromEuler(0, 0, 0); // Ön duvar
            f.body.position.z = -2 - zarKaydirma; // -3 yerine -2
        }

        if (f.mesh) {
            f.mesh.position.copy(f.body.position);
            f.mesh.quaternion.copy(f.body.quaternion);
        }
    });
}

function animateCameraToTopView() {
    const targetPosition = new THREE.Vector3(0, 10, 0); // Kamera yukarıda, zarlara tepeden bakacak
    const targetLookAt = new THREE.Vector3(0, 2, 0); // Zarların yaklaşık merkezi

    // Mevcut kamera pozisyonundan hedef pozisyona yumuşak geçiş (lerp)
    const duration = 1; // Saniye cinsinden
    const startPosition = camera.position.clone();
    let t = 0;

    function updateCamera() {
        t += 1 / 60; // 60 FPS varsayımı
        if (t <= duration) {
            // Pozisyon ve bakış açısını interpolate et
            camera.position.lerpVectors(startPosition, targetPosition, t / duration);
            camera.lookAt(targetLookAt);
            requestAnimationFrame(updateCamera);
        } else {
            // Animasyon bittiğinde son pozisyonu sabitle
            camera.position.copy(targetPosition);
            camera.lookAt(targetLookAt);
        }
    }
    updateCamera();
}

function createDiceMesh() {
    const boxMaterialOuter = new THREE.MeshStandardMaterial({
        color: 0xffffff,
    })
    const boxMaterialInner = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0,
        metalness: 1,
    })

    const g = new THREE.Group();
    const innerSide = 1 - params.edgeRadius;
    const innerMesh = new THREE.Mesh(
        new THREE.BoxGeometry(innerSide, innerSide, innerSide),
        boxMaterialInner
    );
    const outerMesh = new THREE.Mesh(
        createBoxGeometry(),
        boxMaterialOuter
    );
    outerMesh.castShadow = true;
    g.add(innerMesh, outerMesh);

    return g;
}

function createDice() {
    const mesh = diceMesh.clone();
    scene.add(mesh);

    const shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
    const mass = 1;
    const sleepTimeLimit = 0.02;

    const body = new CANNON.Body({
        mass,
        shape,
        sleepTimeLimit
    });
    physicsRender.addBody(body);

    const simulationBody = new CANNON.Body({
        mass,
        shape,
        sleepTimeLimit
    });
    simulation.addBody(simulationBody);

    // Çarpışma sesi için olay dinleyicisi ekle
    body.addEventListener('collide', (event) => {
        const impulse = event.contact.getImpactVelocityAlongNormal();
        if (impulse > 0.99) { // Yalnızca önemli çarpışmalarda ses çal
            collisionSound.currentTime = 0; // Sesi baştan başlat
            collisionSound.play();
        }
    });

    return {
        mesh,
        body: [body, simulationBody],
        startPos: [null, null, null]
    };
}

function createBoxGeometry() {

    let boxGeometry = new THREE.BoxGeometry(1, 1, 1, params.segments, params.segments, params.segments);

    const positionAttr = boxGeometry.attributes.position;
    const subCubeHalfSize = .5 - params.edgeRadius;

    const notchWave = (v) => {
        v = (1 / params.notchRadius) * v;
        v = Math.PI * Math.max(-1, Math.min(1, v));
        return params.notchDepth * (Math.cos(v) + 1.);
    }
    const notch = (pos) => notchWave(pos[0]) * notchWave(pos[1]);

    for (let i = 0; i < positionAttr.count; i++) {

        let position = new THREE.Vector3().fromBufferAttribute(positionAttr, i);
        const subCube = new THREE.Vector3(Math.sign(position.x), Math.sign(position.y), Math.sign(position.z)).multiplyScalar(subCubeHalfSize);
        const addition = new THREE.Vector3().subVectors(position, subCube);

        if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.y) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
            addition.normalize().multiplyScalar(params.edgeRadius);
            position = subCube.add(addition);
        } else if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.y) > subCubeHalfSize) {
            addition.z = 0;
            addition.normalize().multiplyScalar(params.edgeRadius);
            position.x = subCube.x + addition.x;
            position.y = subCube.y + addition.y;
        } else if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
            addition.y = 0;
            addition.normalize().multiplyScalar(params.edgeRadius);
            position.x = subCube.x + addition.x;
            position.z = subCube.z + addition.z;
        } else if (Math.abs(position.y) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
            addition.x = 0;
            addition.normalize().multiplyScalar(params.edgeRadius);
            position.y = subCube.y + addition.y;
            position.z = subCube.z + addition.z;
        }

        const offset = .23;
        if (position.y === .5) {
            position.y -= notch([position.x, position.z]);
        } else if (position.x === .5) {
            position.x -= notch([position.y + offset, position.z + offset]);
            position.x -= notch([position.y - offset, position.z - offset]);
        } else if (position.z === .5) {
            position.z -= notch([position.x - offset, position.y + offset]);
            position.z -= notch([position.x, position.y]);
            position.z -= notch([position.x + offset, position.y - offset]);
        } else if (position.z === -.5) {
            position.z += notch([position.x + offset, position.y + offset]);
            position.z += notch([position.x + offset, position.y - offset]);
            position.z += notch([position.x - offset, position.y + offset]);
            position.z += notch([position.x - offset, position.y - offset]);
        } else if (position.x === -.5) {
            position.x += notch([position.y + offset, position.z + offset]);
            position.x += notch([position.y + offset, position.z - offset]);
            position.x += notch([position.y, position.z]);
            position.x += notch([position.y - offset, position.z + offset]);
            position.x += notch([position.y - offset, position.z - offset]);
        } else if (position.y === -.5) {
            position.y += notch([position.x + offset, position.z + offset]);
            position.y += notch([position.x + offset, position.z]);
            position.y += notch([position.x + offset, position.z - offset]);
            position.y += notch([position.x - offset, position.z + offset]);
            position.y += notch([position.x - offset, position.z]);
            position.y += notch([position.x - offset, position.z - offset]);
        }

        positionAttr.setXYZ(i, position.x, position.y, position.z);
    }

    boxGeometry.deleteAttribute("normal");
    boxGeometry.deleteAttribute("uv");
    boxGeometry = BufferGeometryUtils.mergeVertices(boxGeometry);
    boxGeometry.computeVertexNormals();

    return boxGeometry;
}

let diceStopped = [false, false];
let diceStoppedSayac = 0;
function addDiceEvents(dice, diceIdx) {
    dice.body.forEach(b => {
        b.addEventListener("sleep", (e) => {
            b.allowSleep = false;

            const velocityThreshold = 0.01; // Küçük bir eşik değeri
            const isStopped =
                e.target.velocity.length() < velocityThreshold &&
                e.target.angularVelocity.length() < velocityThreshold;
            if (isStopped) {
                diceStopped[diceIdx] = true;
                if (diceStopped.every(stopped => stopped) && !simulationOn) {
                    if (++diceStoppedSayac == 2) {
                        setTimeout(() => {

                            //alert('bitti');
                            if (params.desiredResult == 12) {
                                confetti({
                                    particleCount: 100, // Number of confetti particles
                                    spread: 90,         // Spread angle in degrees
                                    origin: { y: 0.6 }, // Starting position (0.6 means 60% from the top of the window)
                                });
                                setTimeout(() => {
                                    // confertinin daha fazla görünür olması için, buna 500 ms gecikme verdim
                                    window.parent.postMessage('basarili','*');
                                },750);
                            } else if ([2,3,4,5,6,7,8,9,10,11].indexOf(params.desiredResult) > -1) {
                                window.parent.postMessage('basarisiz','*');
                            } else {
                                window.parent.postMessage('Teknik bir hata olustu. Lütfen daha sonra tekrar deneyiniz. (1).','*');
                            }

                        },250);
                    }
                }
            }

            if (simulationOn) {
                const euler = new CANNON.Vec3();
                e.target.quaternion.toEuler(euler);

                const eps = .1;
                let isZero = (angle) => Math.abs(angle) < eps;
                let isHalfPi = (angle) => Math.abs(angle - .5 * Math.PI) < eps;
                let isMinusHalfPi = (angle) => Math.abs(.5 * Math.PI + angle) < eps;
                let isPiOrMinusPi = (angle) => (Math.abs(Math.PI - angle) < eps || Math.abs(Math.PI + angle) < eps);

                if (isZero(euler.z)) {
                    if (isZero(euler.x)) {
                        currentResult[diceIdx] = 1;
                    } else if (isHalfPi(euler.x)) {
                        currentResult[diceIdx] = 4;
                    } else if (isMinusHalfPi(euler.x)) {
                        currentResult[diceIdx] = 3;
                    } else if (isPiOrMinusPi(euler.x)) {
                        currentResult[diceIdx] = 6;
                    } else {
                        b.allowSleep = true;
                        throwDice();
                    }
                } else if (isHalfPi(euler.z)) {
                    currentResult[diceIdx] = 2;
                } else if (isMinusHalfPi(euler.z)) {
                    currentResult[diceIdx] = 5;
                } else {
                    b.allowSleep = true;
                    throwDice();
                }

                const thisDiceRes = currentResult[diceIdx];
                const anotherDiceRes = currentResult[diceIdx ? 0 : 1];
                const currentSum = currentResult.reduce((a, v) => a + v, 0);

                if (anotherDiceRes === 0 && thisDiceRes >= params.desiredResult) {
                    throwDice();
                } else if (anotherDiceRes !== 0) {
                    if (params.desiredResult !== currentSum) {
                        throwDice();
                    } else {
                        simulationOn = false;
                        throwDice();
                        animateCameraToTopView(); // Kamera animasyonunu başlat
                    }
                }
            }
        });
    });
}

function render() {
    if (simulationOn) {
        simulation.step(1 / 60, 10000, 120); // maxSubSteps'i 60'tan 120'ye çıkardık
    } else {
        physicsRender.fixedStep();
        for (const dice of diceArray) {
            dice.mesh.position.copy(dice.body[0].position);
            dice.mesh.quaternion.copy(dice.body[0].quaternion);
        }
        renderer.render(scene, camera);
    }
    requestAnimationFrame(render);
}

function updateSceneSize() {
    camera.aspect = containerEl.clientWidth / containerEl.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    floorPositionUpdate();
}

var ilk_calisma = false;
function throwDice() {
    if (!ilk_calisma) {
        ilk_calisma = true;
        return;
    }

    const quaternion = new THREE.Quaternion();

    if (simulationOn) {
        currentResult = [0, 0];
        diceArray.forEach(d => {
            d.startPos = [Math.random(), Math.random(), Math.random()];
        });
    }

    diceArray.forEach((d, dIdx) => {
        quaternion.setFromEuler(new THREE.Euler(2 * Math.PI * d.startPos[0], 0, 2 * Math.PI * d.startPos[1]));
        const force = 6 + 3 * d.startPos[2]; // Kuvveti artırdık (4+2 yerine 6+3)

        const b = simulationOn ? d.body[1] : d.body[0];
        b.position = new CANNON.Vec3(1, 6 + dIdx, 1); // Başlangıç yüksekliğini 4'ten 6'ya çıkardık
        b.velocity.setZero();
        b.angularVelocity.setZero();
        b.applyImpulse(
            new CANNON.Vec3(-force * 1.5, force * 1.5, force * 0.5), // Daha fazla yönlü kuvvet
            new CANNON.Vec3(0, 0, -0.5)
        );
        b.quaternion.copy(quaternion);
        b.allowSleep = true;
    });
}
