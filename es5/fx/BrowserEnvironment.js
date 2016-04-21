"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/* global Primrose, THREE, io, CryptoJS, Notification, HMDVRDevice, devicePixelRatio
 * Function, emit, isMobile, isiOS, shell, quad, HTMLCanvasElement, pliny */

Primrose.BrowserEnvironment = function () {
  "use strict";

  if (typeof THREE === "undefined") {
    return function () {};
  }
  /*
   Create a new VR Application!
   
   `name` - name the application, for use with saving settings separately from
   other applications on the same domain
   `options` - optional values to override defaults
   | `avatarHeight` - the offset from the ground at which to place the camera
   | `walkSpeed` - how quickly the avatar moves across the ground
   | `button`
   | `model` - the model to use to make buttons, in THREE JSON format
   | `options` - configuration parameters for buttons
   | `maxThrow` - the distance the button may move
   | `minDeflection` - the angle boundary in which to do hit tests on the button
   | `colorUnpressed` - the color of the button when it is not depressed
   | `colorPressed` - the color of the button when it is depressed
   | `gravity` - the acceleration applied to falling objects (default: 9.8)
   | `useLeap` - use the Leap Motion device
   | `backgroundColor` - the color that WebGL clears the background with before drawing (default: 0x000000)
   | `drawDistance` - the far plane of the camera (default: 500)
   | `chatTextSize` - the size of a single line of text, in world units (default: 0.25)
   | `dtNetworkUpdate` - the amount of time to allow to elapse between sending state to teh server (default: 0.125)
   */
  var RIGHT = new THREE.Vector3(1, 0, 0),
      UP = new THREE.Vector3(0, 1, 0),
      FORWARD = new THREE.Vector3(0, 0, -1),
      POINTER_RADIUS = 0.01,
      POINTER_RESCALE = 20,
      FORWARDED_EVENTS = ["keydown", "keyup", "keypress", "mousedown", "mouseup", "mousemove", "wheel", "touchstart", "touchend", "touchmove"],
      RESOLUTION_SCALE = 1;

  pliny.class({
    parent: "Primrose",
    name: "BrowserEnvironment",
    description: "Make a Virtual Reality app in your web browser!"
  });

  var BrowserEnvironment = function () {
    function BrowserEnvironment(name, options) {
      var _this = this;

      _classCallCheck(this, BrowserEnvironment);

      this.options = patch(options, BrowserEnvironment.DEFAULTS);

      var fire = emit.bind(this);

      this.addEventListener = function (event, thunk, bubbles) {
        if (_this.listeners[event]) {
          _this.listeners[event].push(thunk);
        } else if (FORWARDED_EVENTS.indexOf(event) >= 0) {
          window.addEventListener(event, thunk, bubbles);
        }
      };

      var lockedToEditor = function lockedToEditor() {
        return _this.currentControl && _this.currentControl.lockMovement;
      };

      this.zero = function () {
        if (!lockedToEditor()) {
          _this.player.position.set(0, _this.avatarHeight, 0);
          _this.player.velocity.set(0, 0, 0);
          _this.input.zero();
        }
      };

      var createPickableObject = function createPickableObject(obj, includeGeometry) {
        var geomObj = obj;
        if ((obj.type === "Object3D" || obj.type === "Group") && obj.children[0]) {
          geomObj = obj.children[0];
          geomObj.name = geomObj.name || obj.name;
        }
        var id = geomObj.uuid,
            mLeft = new THREE.Matrix4(),
            mRight = new THREE.Matrix4().identity(),
            mSwap,
            inScene = false,
            lastBag = objectHistory[id],
            update = false,
            disabled = !!obj.disabled,
            bag = {
          uuid: id,
          name: null,
          inScene: null,
          visible: null,
          disabled: null,
          matrix: null,
          geometry: null
        },
            head = geomObj;

        while (head !== null) {
          head.updateMatrix();
          mLeft.copy(head.matrix);
          mLeft.multiply(mRight);
          mSwap = mLeft;
          mLeft = mRight;
          mRight = mSwap;
          head = head.parent;
          inScene = inScene || head === _this.scene;
        }

        if (!lastBag || lastBag.visible !== obj.visible) {
          update = true;
          bag.visible = obj.visible;
        }

        if (!lastBag || lastBag.disabled !== disabled) {
          update = true;
          bag.disabled = disabled;
        }

        var m = mRight.elements.subarray(0, mRight.elements.length),
            mStr = m.join(",");
        if (!lastBag || !lastBag.matrix || lastBag.matrix.join(",") !== mStr) {
          update = true;
          bag.matrix = m;
        }

        if (!lastBag || lastBag.inScene !== inScene) {
          update = true;
          bag.inScene = inScene;
        }

        if (includeGeometry === true) {
          update = true;
          bag.name = obj.name;
          bag.geometry = geomObj.geometry;
        }

        if (update) {
          if (!lastBag) {
            objectHistory[id] = bag;
          } else {
            for (var key in bag) {
              lastBag[key] = bag[key];
            }
          }
          return bag;
        }
      };

      var objectHistory = {};

      this.registerPickableObject = function (obj) {
        if (obj) {
          var bag = createPickableObject(obj, true),
              verts,
              faces,
              uvs,
              i,
              geometry = bag.geometry;
          // it would be nice to do this the other way around, to have everything
          // stored in ArrayBuffers, instead of regular arrays, to pass to the
          // Worker thread. Maybe later.
          if (geometry instanceof THREE.BufferGeometry) {
            var attr = geometry.attributes,
                pos = attr.position,
                uv = attr.uv,
                idx = attr.index;

            verts = [];
            faces = [];
            if (uv) {
              uvs = [];
            }
            for (i = 0; i < pos.count; ++i) {
              verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
              if (uv) {
                uvs.push([uv.getX(i), uv.getY(i)]);
              }
            }
            if (idx) {
              for (i = 0; i < idx.count - 2; ++i) {
                faces.push([idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]);
              }
            } else {
              for (i = 0; i < pos.count; i += 3) {
                faces.push([i, i + 1, i + 2]);
              }
            }
          } else {
            verts = geometry.vertices.map(function (v) {
              return v.toArray();
            });
            faces = [];
            uvs = [];
            // IDK why, but non-buffered geometry has an additional array layer
            for (i = 0; i < geometry.faces.length; ++i) {
              var f = geometry.faces[i],
                  faceUVs = geometry.faceVertexUvs[0][i];
              faces.push([f.a, f.b, f.c]);
              uvs[f.a] = [faceUVs[0].x, faceUVs[0].y];
              uvs[f.b] = [faceUVs[1].x, faceUVs[1].y];
              uvs[f.c] = [faceUVs[2].x, faceUVs[2].y];
            }
          }

          bag.geometry = {
            uuid: geometry.uuid,
            vertices: verts,
            faces: faces,
            uvs: uvs
          };

          _this.pickableObjects[bag.uuid] = obj;
          _this.projector.setObject(bag);
        }
      };

      var wasFullscreen = false;
      var checkFullscreen = function checkFullscreen() {
        if (Primrose.Input.VR.Version === 1 && isMobile) {
          if (wasFullscreen !== FullScreen.isActive) {
            window.dispatchEvent(new Event("vrdisplaypresentchange"));
            wasFullscreen = FullScreen.isActive;
          }
        }
      };

      var update = function update(t) {
        t *= 0.001;
        var dt = t - lt,
            i,
            j;
        lt = t;

        checkFullscreen();

        movePlayer(dt);
        moveSky();
        moveGround();
        movePointer();
        resolvePicking();
        fire("update", dt);
      };

      var movePlayer = function movePlayer(dt) {

        _this.input.update();
        var heading = _this.input.getValue("heading"),
            pitch = _this.input.getValue("pitch"),
            strafe = _this.input.getValue("strafe"),
            drive = _this.input.getValue("drive");

        if (_this.inVR || isMobile) {
          _this.input.getQuaternion("headRX", "headRY", "headRZ", "headRW", qHead);
        } else {
          qHead.set(0, 0, 0, 1);
        }
        qPitch.setFromAxisAngle(RIGHT, pitch);
        if (!_this.player.isOnGround) {
          _this.player.velocity.y -= _this.options.gravity * dt;
        } else if (!lockedToEditor()) {
          _this.player.velocity.set(strafe, 0, drive).normalize().multiplyScalar(_this.walkSpeed);

          qHeading.setFromAxisAngle(UP, currentHeading);
          _this.player.velocity.applyQuaternion(qHead);
          _this.player.velocity.y = 0;
          _this.player.velocity.applyQuaternion(qHeading);
        }

        _this.player.position.add(vBody.copy(_this.player.velocity).multiplyScalar(dt));
        if (!_this.player.isOnGround && _this.player.position.y < _this.avatarHeight) {
          _this.player.isOnGround = true;
          _this.player.position.y = _this.avatarHeight;
          _this.player.velocity.y = 0;
        }

        if (_this.inVR) {
          var dHeading = heading - currentHeading;
          if (!lockedToEditor() && Math.abs(dHeading) > Math.PI / 5) {
            var dh = Math.sign(dHeading) * Math.PI / 100;
            currentHeading += dh;
            heading -= dh;
            dHeading = heading - currentHeading;
          }
          _this.player.quaternion.setFromAxisAngle(UP, currentHeading);
          qHeading.setFromAxisAngle(UP, dHeading).multiply(qPitch);
        } else {
          currentHeading = heading;
          _this.player.quaternion.setFromAxisAngle(UP, currentHeading);
          _this.player.quaternion.multiply(qPitch);
        }
      };

      var moveSky = function moveSky() {
        if (_this.sky) {
          _this.sky.position.copy(_this.player.position);
        }
      };

      var moveGround = function moveGround() {
        if (_this.ground) {
          _this.ground.position.set(Math.floor(_this.player.position.x), 0, Math.floor(_this.player.position.z));
          _this.ground.material.needsUpdate = true;
        }
      };

      var movePointer = function movePointer() {
        _this.pointer.position.copy(FORWARD);
        if (_this.inVR && !isMobile) {
          _this.pointer.position.applyQuaternion(qHeading);
        }
        if (!lockedToEditor() || isMobile) {
          _this.pointer.position.add(_this.camera.position);
          _this.pointer.position.applyQuaternion(_this.camera.quaternion);
        }
        _this.pointer.position.applyQuaternion(_this.player.quaternion);
        _this.pointer.position.add(_this.player.position);
      };

      var pointerStart = function pointerStart(name) {
        if (!(name === "keyboard" && lockedToEditor())) {
          if (currentHit) {
            var object = _this.pickableObjects[currentHit.objectID];
            if (object) {
              var control = object.button || object.surface;
              fire("pointerstart", currentHit);
              emit.call(object, "click");

              if (_this.currentControl && _this.currentControl !== control) {
                _this.currentControl.blur();
                _this.currentControl = null;
              }

              if (!_this.currentControl && control) {
                _this.currentControl = control;
                _this.currentControl.focus();
              } else if (object === _this.ground) {
                _this.player.position.copy(_this.pointer.position);
                _this.player.position.y = _this.avatarHeight;
                _this.player.isOnGround = false;
              }

              if (_this.currentControl) {
                _this.currentControl.startUV(currentHit.point);
              }
            }
          } else if (_this.currentControl) {
            _this.currentControl.blur();
            _this.currentControl = null;
          }
        }
      };

      var pointerEnd = function pointerEnd(name) {
        if (!(name === "keyboard" && lockedToEditor()) && currentHit) {
          var object = _this.pickableObjects[currentHit.objectID];
          if (object) {
            var control = object.button || object.surface;
            fire("pointerend", lastHit);

            if (_this.currentControl) {
              _this.currentControl.endPointer();
            }
          }
        }
      };

      var resolvePicking = function resolvePicking() {

        if (_this.projector.ready) {
          _this.projector.ready = false;
          var arr = [],
              del = [];
          for (var key in _this.pickableObjects) {
            var obj = _this.pickableObjects[key],
                p = createPickableObject(obj);
            if (p) {
              arr.push(p);
              if (p.inScene === false) {
                del.push(key);
              }
            }
          }

          if (arr.length > 0) {
            _this.projector.updateObjects(arr);
          }
          for (var i = 0; i < del.length; ++i) {
            delete _this.pickableObjects[del[i]];
          }

          _this.projector.projectPointer([_this.pointer.position.toArray(), transformForPicking(_this.player)]);
        }

        var lastButtons = _this.input.getValue("dButtons");
        if (currentHit) {
          var fp = currentHit.facePoint,
              fn = currentHit.faceNormal,
              object = _this.pickableObjects[currentHit.objectID];
          _this.pointer.position.set(fp[0] + fn[0] * POINTER_RADIUS, fp[1] + fn[1] * POINTER_RADIUS, fp[2] + fn[2] * POINTER_RADIUS);

          if (object === _this.ground) {
            _this.pointer.scale.set(POINTER_RESCALE, POINTER_RESCALE, POINTER_RESCALE);
          } else {
            _this.pointer.scale.set(1, 1, 1);
          }
          _this.pointer.material.color.setRGB(1, 1, 1);
          _this.pointer.material.emissive.setRGB(0.25, 0.25, 0.25);

          if (object) {
            var buttons = _this.input.getValue("buttons"),
                clickChanged = lastButtons !== 0,
                control = object.button || object.surface;

            if (!lockedToEditor()) {
              buttons |= _this.input.keyboard.getValue("select");
              clickChanged = clickChanged || _this.input.keyboard.getValue("dSelect") !== 0;
            }

            if (!clickChanged && buttons > 0) {
              if (lastHit && currentHit && lastHit.objectID === currentHit.objectID) {
                fire("pointermove", currentHit);
              }
              if (_this.currentControl) {
                _this.currentControl.moveUV(currentHit.point);
              }
            }
          }
        } else {
          _this.pointer.material.color.setRGB(1, 0, 0);
          _this.pointer.material.emissive.setRGB(0.25, 0, 0);
          _this.pointer.scale.set(1, 1, 1);
        }
      };

      var animate = function animate(t) {
        RAF(animate);
        update(t);
        render();
      };

      var eyeCounter = 0,
          blankEye = false;
      var render = function render() {
        if (_this.inVR) {
          _this.renderer.clear(true, true, true);
          var trans = _this.input.vr.transforms;
          for (var i = 0; trans && i < trans.length; ++i) {
            var st = trans[i],
                v = st.viewport,
                side = 2 * i - 1;
            Primrose.Entity.eyeBlankAll(i);
            _this.input.getVector3("headX", "headY", "headZ", _this.camera.position);
            _this.camera.projectionMatrix.copy(st.projection);
            vEye.set(0, 0, 0);
            vEye.applyMatrix4(st.translation);
            vEye.applyQuaternion(qHead);
            _this.camera.position.add(vEye);
            _this.camera.quaternion.copy(qHead);
            if (_this.options.useNose) {
              _this.nose.visible = true;
              _this.nose.position.set(side * -0.12, -0.12, -0.15);
              _this.nose.rotation.z = side * 0.7;
            }
            _this.renderer.setViewport(v.left * RESOLUTION_SCALE, v.top * RESOLUTION_SCALE, v.width * RESOLUTION_SCALE, v.height * RESOLUTION_SCALE);
            _this.renderer.render(_this.scene, _this.camera);
          }
          _this.input.vr.currentDisplay.submitFrame(_this.input.vr.currentPose);
        }

        if (!isMobile) {
          _this.audio.setPlayer(_this.camera);
        }

        if (!_this.inVR || _this.input.vr.currentDisplay.capabilities.hasExternalDisplay && !_this.options.disableMirroring) {
          if (blankEye) {
            Primrose.Entity.eyeBlankAll(eyeCounter = 1 - eyeCounter);
          }
          _this.nose.visible = false;
          _this.camera.fov = _this.options.defaultFOV;
          _this.camera.aspect = _this.renderer.domElement.width / _this.renderer.domElement.height;
          _this.camera.updateProjectionMatrix();
          _this.camera.position.set(0, 0, 0);
          _this.camera.quaternion.copy(qHead);
          _this.renderer.clear(true, true, true);
          _this.renderer.setViewport(0, 0, _this.renderer.domElement.width, _this.renderer.domElement.height);
          _this.renderer.render(_this.scene, _this.camera);
        }
      };

      var setSize = function setSize() {
        var canvasWidth,
            canvasHeight,
            aspectWidth,
            bounds = _this.renderer.domElement.getBoundingClientRect(),
            elementWidth = bounds.width,
            elementHeight = bounds.height;

        if (_this.inVR) {
          if (isMobile) {
            var type = screen.orientation && screen.orientation.type || screen.mozOrientation || "";
            if (type.indexOf("landscape") === -1) {
              type = "landscape-primary";
            }
            if (screen.orientation && screen.orientation.lock) {
              screen.orientation.lock(type);
            } else if (screen.mozLockOrientation) {
              screen.mozLockOrientation(type);
            }
          }
          _this.input.vr.resetTransforms(_this.options.nearPlane, _this.options.nearPlane + _this.options.drawDistance);

          var p = _this.input.vr.transforms,
              l = p[0],
              r = p[1];
          canvasWidth = Math.floor((l.viewport.width + r.viewport.width) * RESOLUTION_SCALE);
          canvasHeight = Math.floor(Math.max(l.viewport.height, r.viewport.height) * RESOLUTION_SCALE);
          aspectWidth = canvasWidth / 2;
        } else {
          if (isMobile) {
            if (screen.orientation && screen.orientation.unlock) {
              screen.orientation.unlock();
            } else if (screen.mozUnlockOrientation) {
              screen.mozUnlockOrientation();
            }
          }
          var pixelRatio = devicePixelRatio || 1;
          if (isiOS) {
            elementHeight = elementWidth * screen.width / screen.height;
          }
          canvasWidth = Math.floor(elementWidth * pixelRatio * RESOLUTION_SCALE);
          canvasHeight = Math.floor(elementHeight * pixelRatio * RESOLUTION_SCALE);
          aspectWidth = canvasWidth;
          if (isMobile) {
            document.body.style.height = Math.max(document.body.clientHeight, elementHeight) + "px";
            document.documentElement.style.height = Math.max(document.documentElement.clientHeight, elementHeight) + "px";
          }
        }

        _this.renderer.domElement.width = canvasWidth;
        _this.renderer.domElement.height = canvasHeight;
        if (!_this.timer) {
          render();
        }
      };

      //
      // Initialize local variables
      //
      var lt = 0,
          lastHit = null,
          currentHit = null,
          currentHeading = 0,
          qPitch = new THREE.Quaternion(),
          qHeading = new THREE.Quaternion(),
          qHead = new THREE.Quaternion(),
          vEye = new THREE.Vector3(),
          vBody = new THREE.Vector3(),
          skin = Primrose.Random.item(Primrose.SKIN_VALUES),
          readyFired = false,
          modelFiles = ["/models/monitor.obj", "/models/fullscreen_text.obj", "/models/cardboard.obj", "/models/vr_text.obj"],
          monitor = null,
          cardboard = null;
      if (this.options.sceneModel) {
        modelFiles.push(this.options.sceneModel);
      }
      if (this.options.button && typeof this.options.button.model === "string") {
        modelFiles.push(this.options.button.model);
      }
      var modelsReady = Primrose.ModelLoader.loadObjects(modelFiles).then(function (models) {
        monitor = models.shift();
        var monitorText = models.shift();
        cardboard = models.shift();
        var cardboardText = models.shift();

        monitor.rotation.set(0, 270 * Math.PI / 180, 0);
        monitor.position.set(0, 0.7, -1);
        monitor.name = "Monitor";
        monitor.addEventListener("click", _this.goFullScreen, false);
        _this.scene.add(monitor);
        _this.scene.Monitor = monitor;
        _this.registerPickableObject(monitor);
        monitor.add(monitorText);

        if (Primrose.Input.VR.Version >= 0) {

          monitor.rotation.set(0, 300 * Math.PI / 180, 0);
          monitor.position.set(-0.25, 0.7, -1);

          cardboard.rotation.set(0, 250 * Math.PI / 180, 0);
          cardboard.position.set(0.2, 1.75, -1);
          cardboard.name = "Cardboard";
          cardboard.addEventListener("click", _this.goVR, false);
          _this.scene.add(cardboard);
          _this.scene.Cardboard = cardboard;
          _this.registerPickableObject(cardboard);
          cardboard.add(cardboardText);
        }

        if (_this.options.sceneModel) {
          buildScene(models.shift());
        }
        if (_this.options.button) {
          _this.buttonFactory = new Primrose.ButtonFactory(models.shift(), _this.options.button.options);
        } else {
          _this.buttonFactory = new Primrose.ButtonFactory(brick(0xff0000, 1, 1, 1), {
            maxThrow: 0.1,
            minDeflection: 10,
            colorUnpressed: 0x7f0000,
            colorPressed: 0x007f00,
            toggle: true
          });
        }
      }).then(function () {
        return fire("ready");
      });

      //
      // Initialize public properties
      //
      this.currentControl = null;
      this.avatarHeight = this.options.avatarHeight;
      this.walkSpeed = this.options.walkSpeed;
      this.listeners = {
        ready: [],
        update: [],
        gazestart: [],
        gazecomplete: [],
        gazecancel: [],
        pointerstart: [],
        pointermove: [],
        pointerend: []
      };

      this.audio = new Primrose.Output.Audio3D();
      var audioReady = null,
          ocean = null;
      if (this.options.ambientSound && !isMobile) {
        audioReady = this.audio.load3DSound(this.options.ambientSound, true, -1, 1, -1).then(function (aud) {
          ocean = aud;
          ocean.volume.gain.value = 0.1;
          ocean.source.start();
        });
      } else {
        audioReady = Promise.resolve();
      }
      this.music = new Primrose.Output.Music(this.audio.context);

      this.pickableObjects = {};

      if (isGearVR) {
        this.projector = new Primrose.Projector();
      } else {
        this.projector = new Primrose.Workerize(Primrose.Projector);
      }

      this.player = new THREE.Object3D();
      this.player.velocity = new THREE.Vector3();
      this.player.name = "Player";
      this.player.position.set(0, this.avatarHeight, 0);
      this.player.isOnGround = true;

      this.pointer = textured(sphere(POINTER_RADIUS, 10, 10), 0xff0000);
      this.pointer.material.emissive.setRGB(0.25, 0, 0);
      this.pointer.material.opacity = 0.75;

      this.nose = textured(sphere(0.05, 10, 10), skin);
      this.nose.name = "Nose";
      this.nose.scale.set(0.5, 1, 1);

      this.renderer = new THREE.WebGLRenderer({
        canvas: Primrose.DOM.cascadeElement(this.options.canvasElement, "canvas", HTMLCanvasElement),
        antialias: !isMobile,
        alpha: true,
        logarithmicDepthBuffer: false
      });
      this.renderer.autoClear = false;
      this.renderer.autoSortObjects = true;
      this.renderer.setClearColor(this.options.backgroundColor);
      if (!this.renderer.domElement.parentElement) {
        document.body.appendChild(this.renderer.domElement);
      }

      this.input = new Primrose.Input.FPSInput(this.renderer.domElement);

      this.scene = new THREE.Scene();
      if (this.options.useFog) {
        this.scene.fog = new THREE.FogExp2(this.options.backgroundColor, 2 / this.options.drawDistance);
      }

      this.camera = new THREE.PerspectiveCamera(75, 1, this.options.nearPlane, this.options.nearPlane + this.options.drawDistance);

      if (this.options.skyTexture) {
        this.sky = textured(shell(this.options.drawDistance, 18, 9, Math.PI * 2, Math.PI), this.options.skyTexture, { unshaded: true });
        this.sky.name = "Sky";
        this.scene.add(this.sky);
      }

      if (this.options.groundTexture) {
        var dim = 10,
            gm = new THREE.PlaneGeometry(dim * 5, dim * 5, dim, dim);
        this.ground = textured(gm, this.options.groundTexture, {
          txtRepeatS: dim * 5,
          txtRepeatT: dim * 5
        });
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.name = "Ground";
        this.scene.add(this.ground);
        this.registerPickableObject(this.ground);
      }

      this.camera.add(this.nose);
      this.player.add(this.camera);
      this.scene.add(this.player);
      this.scene.add(this.pointer);

      if (this.passthrough) {
        this.camera.add(this.passthrough.mesh);
      }

      var buildScene = function buildScene(sceneGraph) {
        sceneGraph.buttons = [];
        sceneGraph.traverse(function (child) {
          if (child.isButton) {
            sceneGraph.buttons.push(new Primrose.Button(child.parent, child.name));
          }
          if (child.name) {
            sceneGraph[child.name] = child;
          }
        });
        _this.scene.add.apply(_this.scene, sceneGraph.children);
        _this.scene.traverse(function (obj) {
          if (obj.name) {
            _this.scene[obj.name] = obj;
          }
        });
        if (sceneGraph.Camera) {
          _this.camera.position.copy(sceneGraph.Camera.position);
          _this.camera.quaternion.copy(sceneGraph.Camera.quaternion);
        }
        return sceneGraph;
      };

      put(light(0xffffff, 1.5, 50)).on(this.scene).at(0, 10, 10);

      var RAF = function RAF(callback) {
        if (_this.inVR) {
          _this.timer = _this.input.vr.currentDisplay.requestAnimationFrame(callback);
        } else {
          _this.timer = requestAnimationFrame(callback);
        }
      };

      this.start = function () {
        Promise.all([modelsReady, audioReady]).then(setSize).then(function () {
          return RAF(animate);
        });
      };

      this.stop = function () {
        if (_this.inVR) {
          _this.input.vr.currentDisplay.cancelAnimationFrame(_this.timer);
        } else {
          cancelAnimationFrame(_this.timer);
        }
        _this.timer = null;
      };

      var handleHit = function handleHit(h) {
        var dt;
        _this.projector.ready = true;
        lastHit = currentHit;
        currentHit = h;
        if (lastHit && currentHit && lastHit.objectID === currentHit.objectID) {
          currentHit.startTime = lastHit.startTime;
          currentHit.gazeFired = lastHit.gazeFired;
          dt = lt - currentHit.startTime;
          if (dt >= _this.options.gazeLength && !currentHit.gazeFired) {
            currentHit.gazeFired = true;
            fire("gazecomplete", currentHit);
          }
        } else {
          if (lastHit) {
            dt = lt - lastHit.startTime;
            if (dt < _this.options.gazeLength) {
              fire("gazecancel", lastHit);
            }
          }
          if (currentHit) {
            currentHit.startTime = lt;
            currentHit.gazeFired = false;
            fire("gazestart", currentHit);
          }
        }
      };

      var keyDown = function keyDown(evt) {
        if (!lockedToEditor() && !evt.shiftKey && !evt.ctrlKey && !evt.altKey && !evt.metaKey) {
          if (evt.keyCode === Primrose.Keys.E) {
            blankEye = true;
            evt.preventDefault();
          }
        } else if (_this.currentControl) {
          var elem = _this.currentControl.focusedElement;
          if (elem.execCommand) {
            var oldDeadKeyState = _this.operatingSystem._deadKeyState;
            if (elem.execCommand(_this._browser, _this.codePage, _this.operatingSystem.makeCommandName(evt, _this.codePage))) {
              evt.preventDefault();
            }
            if (_this.operatingSystem._deadKeyState === oldDeadKeyState) {
              _this.operatingSystem._deadKeyState = "";
            }
          } else {
            elem.keyDown(evt);
          }
        }
      };

      var keyUp = function keyUp(evt) {
        if (_this.currentControl) {
          _this.currentControl.keyUp(evt);
        } else if (!evt.shiftKey && !evt.ctrlKey && !evt.altKey && !evt.metaKey) {
          if (evt.keyCode === Primrose.Keys.E) {
            blankEye = false;
          }
        }
      };

      //
      // Manage full-screen state
      //
      this.goFullScreen = function () {
        return FullScreen.request(_this.renderer.domElement);
      };

      this.goVR = function () {
        if (_this.input.vr) {
          return _this.input.vr.requestPresent([{ source: _this.renderer.domElement }]).then(function (elem) {
            if (Primrose.Input.VR.Version === 1 && isMobile) {
              var remover = function remover() {
                _this.input.vr.currentDisplay.exitPresent();
                window.removeEventListener("vrdisplaypresentchange", remover);
              };

              var adder = function adder() {
                window.addEventListener("vrdisplaypresentchange", remover, false);
                window.removeEventListener("vrdisplaypresentchange", adder);
              };

              window.addEventListener("vrdisplaypresentchange", adder, false);
            }

            return elem;
          });
        }
      };

      var showHideButtons = function showHideButtons() {
        cardboard.disabled = monitor.disabled = isFullScreenMode();
        cardboard.visible = monitor.visible = !isFullScreenMode();
      };

      window.addEventListener("vrdisplaypresentchange", showHideButtons, false);
      FullScreen.addChangeListener(showHideButtons, false);

      Primrose.Input.Mouse.Lock.addChangeListener(function (evt) {
        if (!Primrose.Input.Mouse.Lock.isActive && _this.inVR) {
          _this.input.vr.currentDisplay.exitPresent();
        }
      }, false);

      window.addEventListener("vrdisplaypresentchange", setSize, false);

      var isFullScreenMode = function isFullScreenMode() {
        return !!(FullScreen.isActive || _this.inVR);
      };

      BrowserEnvironment.createSurrogate.call(this);

      this.operatingSystem = this.options.os;
      this.codePage = this.options.language;

      var focusClipboard = function focusClipboard(evt) {
        var cmdName = _this.operatingSystem.makeCommandName(evt, _this.codePage);
        if (cmdName === "CUT" || cmdName === "COPY") {
          _this._surrogate.style.display = "block";
          _this._surrogate.focus();
        }
      };

      var setPointerLock = function setPointerLock() {
        if (!isMobile) {
          return Primrose.Input.Mouse.Lock.isActive || Primrose.Input.Mouse.Lock.request(_this.renderer.domElement);
        }
      };

      var setFullscreen = function setFullscreen() {
        if (!isFullScreenMode()) {
          if (Primrose.Input.VR.Version > 0) {
            _this.goVR();
          } else {
            _this.goFullScreen();
          }
        }
      };

      var withCurrentControl = function withCurrentControl(name) {
        return function (evt) {
          if (_this.currentControl) {
            _this.currentControl[name](evt);
          }
        };
      };

      this._browser = isChrome ? "CHROMIUM" : isFirefox ? "FIREFOX" : isIE ? "IE" : isOpera ? "OPERA" : isSafari ? "SAFARI" : "UNKNOWN";
      window.addEventListener("keydown", keyDown, false);
      window.addEventListener("keyup", keyUp, false);
      window.addEventListener("keydown", focusClipboard, true);
      window.addEventListener("beforepaste", setFalse, false);
      window.addEventListener("paste", withCurrentControl("readClipboard"), false);
      window.addEventListener("wheel", withCurrentControl("readWheel"), false);
      window.addEventListener("resize", setSize, false);
      window.addEventListener("blur", this.stop, false);
      window.addEventListener("focus", this.start, false);
      this.renderer.domElement.addEventListener('webglcontextlost', this.stop, false);
      this.renderer.domElement.addEventListener('webglcontextrestored', this.start, false);
      this.input.addEventListener("zero", this.zero.bind(this), false);
      this.input.addEventListener("lockpointer", setPointerLock, false);
      this.input.addEventListener("fullscreen", setFullscreen, false);
      this.input.addEventListener("pointerstart", pointerStart, false);
      this.input.addEventListener("pointerend", pointerEnd, false);
      this.projector.addEventListener("hit", handleHit, false);

      Object.defineProperties(this, {
        inVR: {
          get: function get() {
            return _this.input.vr && _this.input.vr.currentDisplay && _this.input.vr.currentDisplay.isPresenting;
          }
        }
      });

      if (window.alert.toString().indexOf("native code") > -1) {
        // overwrite the native alert functions so they can't be called while in
        // fullscreen VR mode.

        var rerouteDialog = function rerouteDialog(oldFunction, newFunction) {
          if (!newFunction) {
            newFunction = function newFunction() {};
          }
          return function () {
            if (isFullScreenMode()) {
              newFunction();
            } else {
              oldFunction.apply(window, arguments);
            }
          };
        };

        window.alert = rerouteDialog(window.alert);
        window.confirm = rerouteDialog(window.confirm);
        window.prompt = rerouteDialog(window.prompt);
      }

      this.start();
    }

    _createClass(BrowserEnvironment, [{
      key: "operatingSystem",
      get: function get() {
        return this._operatingSystem;
      },
      set: function set(os) {
        this._operatingSystem = os || (isOSX ? Primrose.Text.OperatingSystems.OSX : Primrose.Text.OperatingSystems.Windows);
      }
    }, {
      key: "codePage",
      get: function get() {
        return this._codePage;
      },
      set: function set(cp) {
        var key, code, char, name;
        this._codePage = cp;
        if (!this._codePage) {
          var lang = navigator.languages && navigator.languages[0] || navigator.language || navigator.userLanguage || navigator.browserLanguage;

          if (!lang || lang === "en") {
            lang = "en-US";
          }

          for (key in Primrose.Text.CodePages) {
            cp = Primrose.Text.CodePages[key];
            if (cp.language === lang) {
              this._codePage = cp;
              break;
            }
          }

          if (!this._codePage) {
            this._codePage = Primrose.Text.CodePages.EN_US;
          }
        }
      }
    }], [{
      key: "createSurrogate",
      value: function createSurrogate() {
        var _this2 = this;

        var clipboardOperation = function clipboardOperation(name, evt) {
          if (_this2.currentControl) {
            _this2.currentControl[name + "SelectedText"](evt);
            if (!evt.returnValue) {
              evt.preventDefault();
            }
            _this2._surrogate.style.display = "none";
            _this2.currentControl.canvas.focus();
          }
        };

        // the `surrogate` textarea makes clipboard events possible
        this._surrogate = Primrose.DOM.cascadeElement("primrose-surrogate-textarea", "textarea", HTMLTextAreaElement);
        this._surrogateContainer = Primrose.DOM.makeHidingContainer("primrose-surrogate-textarea-container", this._surrogate);
        this._surrogateContainer.style.position = "absolute";
        this._surrogateContainer.style.overflow = "hidden";
        this._surrogateContainer.style.width = 0;
        this._surrogateContainer.style.height = 0;
        this._surrogate.addEventListener("beforecopy", setFalse, false);
        this._surrogate.addEventListener("copy", clipboardOperation.bind(this, "copy"), false);
        this._surrogate.addEventListener("beforecut", setFalse, false);
        this._surrogate.addEventListener("cut", clipboardOperation.bind(this, "cut"), false);
        document.body.insertBefore(this._surrogateContainer, document.body.children[0]);
      }
    }]);

    return BrowserEnvironment;
  }();

  BrowserEnvironment.DEFAULT_USER_NAME = "CURRENT_USER_OFFLINE";

  BrowserEnvironment.DEFAULTS = {
    useNose: false,
    useLeap: false,
    useFog: true,
    avatarHeight: 1.75,
    walkSpeed: 2,
    // The acceleration applied to falling objects.
    gravity: 9.8,
    // The amount of time in seconds to require gazes on objects before triggering the gaze event.
    gazeLength: 1,
    // By default, what we see in the VR view will get mirrored to a regular view on the primary screen. Set to true to improve performance.
    disableMirroring: false,
    // The color that WebGL clears the background with before drawing.
    backgroundColor: 0xafbfff,
    // the near plane of the camera
    nearPlane: 0.01,
    // the far plane of the camera
    drawDistance: 100,
    // the field of view to use in non-VR settings
    defaultFOV: 75,
    // the amount of time to allow to elapse between sending state to the server
    dtNetworkUpdate: 0.125,
    canvasElement: "frontBuffer",
    // The sound to play on loop in the background
    ambientSound: null
  };

  function transformForPicking(obj) {
    var p = obj.position.clone();
    obj = obj.parent;
    while (obj !== null) {
      p.applyMatrix4(obj.matrix);
      obj = obj.parent;
    }
    return p.toArray();
  }

  return BrowserEnvironment;
}();

pliny.issue({
  parent: "Primrose.BrowserEnvironment",
  name: "document BrowserEnvironment",
  type: "open",
  description: "Finish writing the documentation for the [Primrose.BrowserEnvironment](#Primrose_BrowserEnvironment) class in the  directory"
});

pliny.issue({
  parent: "Primrose.BrowserEnvironment",
  name: "scene FOV issues",
  type: "open",
  description: "Image appears \"zoomed in\" when in VR mode. See \n\
[VR mode seems \"zoomed in\" with DK2 · Issue #72 · capnmidnight/Primrose](https://github.com/capnmidnight/Primrose/issues/72) \n\
for more information."
});

pliny.issue({
  parent: "Primrose.BrowserEnvironment",
  name: "default light",
  type: "open",
  description: "When the user does not define a scene model file and opts to use the\n\
default scene, make sure a point light is added to the scene so the ground is visible."
});