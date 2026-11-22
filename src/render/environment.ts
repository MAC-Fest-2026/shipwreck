import * as T from 'three'
import { seededRandom } from '../core/math'
import { boatLungeTiming } from '../sim/boat'
import { waterGlsl, waveAmplitude, waveHeight } from '../sim/water'

function lungeElevation(age: number) {
  const { bite, strike, clear, end } = boatLungeTiming
  const { smoothstep } = T.MathUtils
  return -1.05 + 1.4 * (smoothstep(age, bite, strike) - smoothstep(age, strike, clear))
    - 7.2 * smoothstep(age, clear, end)
}

export function boatSharkWaterline(x: number, z: number, time: number, age: number, vx: number, vz: number) {
  const delta = 0.01
  const up = waveHeight(x + vx * delta, z + vz * delta, time + delta) + lungeElevation(age + delta)
  const down = waveHeight(x - vx * delta, z - vz * delta, time - delta) + lungeElevation(age - delta)
  return { height: waveHeight(x, z, time) + lungeElevation(age), verticalSpeed: (up - down) / (2 * delta) }
}

const noise = `
float rand2(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise2(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(rand2(i),rand2(i+vec2(1.,0.)),f.x),mix(rand2(i+vec2(0.,1.)),rand2(i+1.),f.x),f.y);
}
float fbm(vec2 p) {
  float s=0., a=.56;
  for(int i=0;i<4;i++){s+=a*noise2(p);p=mat2(.81,.59,-.59,.81)*p*2.06;a*=.48;}
  return s;
}
`

const skyColors = `
vec3 horizonColor(float dawn) { return mix(vec3(.20,.316,.358), vec3(.55,.42,.31), dawn); }
vec3 zenithColor(float dawn) { return mix(vec3(.024,.083,.124), vec3(.15,.26,.31), dawn); }
`

export type SceneUniforms = {
  time: { value: number }
  dawn: { value: number }
  flash: { value: number }
  fog: { value: number }
  contact: { value: T.Vector3 }
  search: { value: number }
  sunDirection: { value: T.Vector3 }
  shoal: { value: T.Vector4 }
  boardFoam: { value: T.Vector3 }
  hullFoamPose: { value: T.Vector4 }
  hullFoamSize: { value: T.Vector3 }
}

export interface SceneEnvironment {
  sea: T.Mesh
  sky: T.Mesh
  uniforms: SceneUniforms
}

export interface SceneBeam {
  mesh: T.Mesh
  intensity: { value: number }
}

export interface SceneMaterials {
  environment(scene: T.Scene): SceneEnvironment
  beam(parent: T.Object3D, color?: string): SceneBeam
}

export function environmentSettings(): SceneUniforms {
  return {
    time: { value: 0 }, dawn: { value: 0 }, flash: { value: 0 },
    fog: { value: 0.0048 }, contact: { value: new T.Vector3(-14, 0, 0) },
    search: { value: 0 }, sunDirection: { value: new T.Vector3(-0.34, 0.11, -0.93).normalize() },
    shoal: { value: new T.Vector4(0, 0, 1, 1) }, boardFoam: { value: new T.Vector3() },
    hullFoamPose: { value: new T.Vector4(0, 0, 1, 0) }, hullFoamSize: { value: new T.Vector3(1, 1, 0) },
  }
}

export function seaGeometry() {
  const geom = new T.PlaneGeometry(2, 2, 224, 224)
  geom.rotateX(-Math.PI / 2)
  const vertices = geom.attributes.position
  // Keep close to 1.25-unit spacing around the action and stretch toward the horizon.
  const shape = (n: number) => 140 * n + 1298 * n ** 13
  for (let i = 0; i < vertices.count; i++) {
    vertices.setXYZ(i, shape(vertices.getX(i)), 0, shape(vertices.getZ(i)))
  }
  return geom
}

export function environment(scene: T.Scene): SceneEnvironment {
  const uniforms = environmentSettings()
  const sea = new T.Mesh(seaGeometry(), new T.ShaderMaterial({
    uniforms: { ...uniforms, waterDetail: { value: waterDetailTexture() },
      crestScale: { value: 1 / Math.max(waveAmplitude, 0.001) } },
    vertexShader: `
      uniform float time;
      varying vec3 world;
      varying vec2 waveSlope;
      ${waterGlsl}
      void main() {
        world = (modelMatrix * vec4(position,1.)).xyz;
        vec3 wave = oceanSample(world.xz, time);
        world.y = wave.x;
        waveSlope = wave.yz;
        gl_Position = projectionMatrix * viewMatrix * vec4(world,1.);
      }
    `,
    fragmentShader: `
      uniform float time, dawn, flash, fog, search, crestScale;
      uniform vec3 contact, sunDirection, boardFoam, hullFoamSize;
      uniform vec4 shoal, hullFoamPose;
      uniform sampler2D waterDetail;
      varying vec3 world;
      varying vec2 waveSlope;
      ${skyColors}

      float boxEdge(vec2 p, vec2 halfSize) {
        vec2 q = abs(p) - halfSize;
        return length(max(q, 0.)) + min(max(q.x, q.y), 0.);
      }

      float wash(float edge, float width, float grain) {
        float brokenEdge = edge + (grain - .5) * .75;
        return smoothstep(-.51, -.12, edge) * (1. - smoothstep(.02, width, brokenEdge))
          * smoothstep(.32, .72, grain);
      }

      void main() {
        vec2 p = world.xz;
        vec3 toEye = cameraPosition - world;
        float dist = length(toEye);
        vec3 eye = toEye / max(dist, .001);
        mat2 turn = mat2(.8, .6, -.6, .8);
        // The tile stores surface slopes in RG and foam grain in B.
        vec3 ripples = texture2D(waterDetail, p * .073 + time * vec2(.011, -.017)).rgb;
        vec3 fizz = texture2D(waterDetail, turn * p * .31 + time * vec2(-.051, .027)).rgb;
        float nearDetail = 1. - smoothstep(38., 185., dist);
        vec2 detailSlope = (ripples.rg - .5) * .24 + ((fizz.rg - .5) * turn) * .115;
        vec2 slope = waveSlope + detailSlope * nearDetail;
        vec3 normal = normalize(vec3(-slope.x, 1., -slope.y));
        float elevation = world.y * crestScale;

        // Approximate the seabed with a shelf around the island and deep water offshore.
        vec2 fromShore = (p - shoal.xy) * shoal.zw;
        float seabedDepth = mix(2.5, 56., smoothstep(.72, 2.2, dot(fromShore, fromShore)));
        float absorption = 1. - exp(-max(0., seabedDepth + world.y) * .078);
        vec3 shallow = mix(vec3(.06,.22,.22), vec3(.085,.37,.31), dawn);
        vec3 deep = mix(vec3(.015,.081,.119), vec3(.027,.118,.15), dawn);
        vec3 body = mix(shallow, deep, absorption) * mix(.68, 1.29, smoothstep(-.82, .73, elevation));

        vec3 horizon = horizonColor(dawn);
        vec3 reflected = reflect(-eye, normal);
        vec3 sky = mix(horizon, zenithColor(dawn), smoothstep(0., .62, reflected.y));
        float grazing = 1. - max(0., dot(normal, eye));
        float fresnel = .026 + .78 * pow(grazing, 4.);
        vec3 color = mix(body, sky, fresnel);
        float highlight = max(0., dot(normal, normalize(eye + sunDirection)));
        float glint = pow(highlight, 94.) * .72 + pow(highlight, 16.) * .09;
        color += mix(vec3(.23,.36,.43), vec3(1.,.69,.36), dawn) * glint * (.43 + 1.05*dawn);

        float grain = mix(ripples.b, fizz.b, .44);
        float crest = smoothstep(.38, .83, elevation + (grain - .5) * .34);
        float foam = crest * smoothstep(.33, .75, grain) * .79;
        vec2 fromBoard = p - boardFoam.xy;
        if (boardFoam.z > 0. && all(lessThan(abs(fromBoard), vec2(7., 4.5)))) {
          foam = max(foam, wash(boxEdge(fromBoard, vec2(4.85,1.95)) - .38, 1.25, grain) * boardFoam.z);
        }
        vec2 fromHull = p - hullFoamPose.xy;
        float reach = hullFoamSize.x + 2.5;
        if (hullFoamSize.z > 0. && dot(fromHull, fromHull) < reach * reach) {
          vec2 forward = hullFoamPose.zw;
          vec2 along = vec2(dot(fromHull, forward), dot(fromHull, vec2(-forward.y, forward.x)));
          float taper = 1. - .90 * smoothstep(.12, 1., along.x / hullFoamSize.x);
          float edge = boxEdge(along, vec2(hullFoamSize.x, hullFoamSize.y * taper)) - .23;
          foam = max(foam, wash(edge, 1.65, grain) * hullFoamSize.z);
        }
        if (search > 0.) {
          vec2 underHelicopter = p - contact.xz;
          float pool = exp(-dot(underHelicopter, underHelicopter) * .031) * search;
          float rotor = exp(-abs(length(underHelicopter) - 7.) * .76) * grain * search;
          foam = max(foam, rotor);
          color += vec3(.43,.23,.075) * pool * (.3 + .7 * grain);
        }
        color = mix(color, mix(vec3(.54,.68,.70), vec3(.83,.83,.71), dawn), clamp(foam, 0., .84));
        color += vec3(.2,.28,.35) * flash * (.24 + glint);
        float mist = 1. - exp(-dist * fog);
        gl_FragColor = sRGBTransferEOTF(vec4(mix(color, horizon, mist), 1.));
        #include <colorspace_fragment>
      }
    `,
  }))
  sea.frustumCulled = false
  scene.add(sea)

  const sky = new T.Mesh(new T.SphereGeometry(1800, 32, 16), new T.ShaderMaterial({
    uniforms, side: T.BackSide, depthWrite: false,
    vertexShader: `
      varying vec3 ray;
      void main() {
        ray=position;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }
    `,
    fragmentShader: `
      uniform float time,dawn,flash;
      uniform vec3 sunDirection;
      varying vec3 ray;
      ${noise}
      ${skyColors}
      void main() {
        vec3 dir=normalize(ray);
        float y=max(0.,dir.y);
        vec2 p=dir.xz/(.31+y)*2.7;
        float cloud=fbm(p+vec2(.009*time,-.004*time));
        float bands=fbm(p*.42+cloud*.51);
        vec3 horizon=horizonColor(dawn);
        vec3 zenith=zenithColor(dawn);
        vec3 col=mix(horizon,zenith,smoothstep(0.,.65,y));
        col*=mix(.58,1.24,smoothstep(.195,.70,cloud*.72+bands*.28));
        float sunset=pow(max(0.,dot(dir,sunDirection)),12.)*exp(-y*6.);
        col+=mix(vec3(.115,.066,.035),vec3(.61,.32,.10),dawn)*sunset;
        col=mix(horizon,col,smoothstep(0.,.038,y));
        col+=vec3(.30,.39,.51)*flash*(.4+cloud);
        gl_FragColor=sRGBTransferEOTF(vec4(col,1.));
        #include <colorspace_fragment>
      }
    `,
  }))
  sky.renderOrder = -10
  scene.add(sky)
  return { sea, sky, uniforms }
}

function noiseTile(size: number, cells: number, seed: number) {
  const cellSize = size / cells
  const random = seededRandom(seed)
  const grid = Float32Array.from({ length: cells * cells }, random)
  const pixels = new Uint8Array(size * size)
  const { lerp, smoothstep } = T.MathUtils
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / cellSize) * cells
    const nextRow = (row + cells) % grid.length
    const ty = smoothstep(y % cellSize, 0, cellSize)
    for (let x = 0; x < size; x++) {
      const col = Math.floor(x / cellSize)
      const nextCol = (col + 1) % cells
      const tx = smoothstep(x % cellSize, 0, cellSize)
      pixels[y * size + x] = 255 * lerp(lerp(grid[row + col], grid[row + nextCol], tx),
        lerp(grid[nextRow + col], grid[nextRow + nextCol], tx), ty)
    }
  }
  return pixels
}

function waterDetailTexture() {
  const size = 128
  const noise = noiseTile(size, 16, 137)
  const data = new Uint8Array(size * size * 4)
  const sample = (x: number, y: number) => noise[((y + size) % size) * size + (x + size) % size]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      data[i] = T.MathUtils.clamp(128 + (sample(x + 1, y) - sample(x - 1, y)) * 1.5, 0, 255)
      data[i + 1] = T.MathUtils.clamp(128 + (sample(x, y + 1) - sample(x, y - 1)) * 1.5, 0, 255)
      data[i + 2] = sample(x, y)
      data[i + 3] = 255
    }
  }
  const texture = new T.DataTexture(data, size, size)
  texture.wrapS = texture.wrapT = T.RepeatWrapping
  texture.minFilter = T.LinearMipmapLinearFilter
  texture.magFilter = T.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

function particleNoiseTexture() {
  const size = 64
  const texture = new T.DataTexture(noiseTile(size, 8, 68), size, size, T.RedFormat)
  texture.wrapS = texture.wrapT = T.RepeatWrapping
  texture.minFilter = texture.magFilter = T.LinearFilter
  texture.needsUpdate = true
  return texture
}

export function wreckAtmosphere() {
  const root = new T.Group()
  const random = seededRandom(199)
  // Deck positions measured in the oriented, scaled cruise ship's local space.
  const fireSites = [
    new T.Vector3(-46, 16.95, -5),
    new T.Vector3(-8, 15.57, 2),
    new T.Vector3(28, 18.27, -5),
  ]
  const deckOrigins = fireSites.map(() => new T.Vector3())
  const uniforms = {
    deckOrigins: { value: deckOrigins },
    time: { value: 0 },
    particleNoise: { value: particleNoiseTexture() },
  }
  const billboard = new T.PlaneGeometry(1, 1)
  const particles = (layers: number) => {
    const geometry = new T.InstancedBufferGeometry()
    geometry.setIndex(billboard.index)
    geometry.setAttribute('position', billboard.attributes.position)
    geometry.setAttribute('uv', billboard.attributes.uv)
    const data = Array.from({ length: layers * fireSites.length }, (_, i) =>
      [i % fireSites.length, random(), Math.floor(i / fireSites.length), random()]).flat()
    geometry.setAttribute('particle', new T.InstancedBufferAttribute(new Float32Array(data), 4))
    geometry.instanceCount = layers * fireSites.length
    return geometry
  }
  const smoke = new T.Mesh(particles(10), new T.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      uniform vec3 deckOrigins[3];
      uniform float time;
      attribute vec4 particle;
      varying vec2 tex;
      varying float age, seed, strength;
      void main() {
        seed=particle.y;
        strength=vec3(.73,1.,.57)[int(particle.x)];
        age=fract(time*(.135+particle.x*.007)+particle.z*.618);
        vec3 center=deckOrigins[int(particle.x)];
        center+=vec3(18.*age+sin(age*6.+seed*6.)*4.*age,
          age*(22.+seed*7.)*strength, -6.*age+(particle.w-.5)*11.*age);
        vec4 viewPos=viewMatrix*vec4(center,1.);
        vec2 corner=position.xy;
        float twist=sin(age*3.+seed*6.)*.57;
        corner=mat2(cos(twist),sin(twist),-sin(twist),cos(twist))*corner;
        viewPos.xy+=corner*vec2(mix(3.9,20.,age),mix(5.6,20.,age))*(.33+.67*strength);
        tex=uv*2.-1.;
        gl_Position=projectionMatrix*viewPos;
      }`,
    fragmentShader: `
      uniform sampler2D particleNoise;
      varying vec2 tex;
      varying float age, seed, strength;
      void main() {
        float radius = length(tex);
        if (radius > 1.13) discard;
        float cloud=texture2D(particleNoise,tex*.4125+seed*5.875+vec2(age,-age*2.4)*.125).r;
        float detail=texture2D(particleNoise,tex*.9375-seed*3.875).r;
        float edge=1.-smoothstep(.1,1.,radius+.34*(cloud-.5));
        float opacity=edge*edge*(.35+.51*cloud+.14*detail);
        opacity*=smoothstep(0.,.08,age)*(1.-smoothstep(.42,1.,age))*(.33+.43*strength);
        vec3 soot=mix(vec3(.047,.054,.057),vec3(.16,.18,.18),age*.64+cloud*.32);
        gl_FragColor=vec4(soot,opacity);
      }`,
  }))
  const flame = new T.Mesh(particles(3), new T.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      uniform vec3 deckOrigins[3];
      uniform float time;
      attribute vec4 particle;
      varying vec2 tex;
      varying float seed;
      void main() {
        seed=particle.y;
        float strength=vec3(.72,1.13,.78)[int(particle.x)];
        vec3 center=deckOrigins[int(particle.x)]+vec3((particle.z-1.)*.78+(seed-.5)*.49,.05,(particle.w-.5)*.6);
        float height=(1.4+seed*2.)*(.77+.23*sin(time*5.6+seed*23.))*strength;
        vec4 viewPos=viewMatrix*vec4(center,1.);
        viewPos.xyz+=vec3(position.x*(2.+seed*.85)*strength,0.,0.);
        viewPos.xyz+=mat3(viewMatrix)*vec3(.38*uv.y,height*uv.y,0.);
        tex=uv;
        gl_Position=projectionMatrix*viewPos;
      }`,
    fragmentShader: `
      uniform float time;
      uniform sampler2D particleNoise;
      varying vec2 tex;
      varying float seed;
      void main() {
        vec2 flow=vec2(tex.x*3.+seed*12.,tex.y*3.7-time*4.2);
        float flicker=texture2D(particleNoise,flow*.125).r;
        float tongue=abs(tex.x-.5+(flicker-.5)*tex.y*.54);
        float width=(.43-flicker*.11)*pow(1.-tex.y,.57);
        float edge=1.-smoothstep(width*.51,width+.035,tongue);
        float fade=1.-smoothstep(.61,.97,tex.y+(.5-flicker)*.19);
        vec2 baseGlow=(tex-vec2(.5,.07))*vec2(3.,11.);
        float glow=exp(-dot(baseGlow,baseGlow))*.24;
        float density=max(glow,edge*fade*smoothstep(0.,.09,tex.y));
        float hot=(1.-smoothstep(.04,.23,tongue))*(1.-smoothstep(.18,.68,tex.y));
        vec3 ember=mix(vec3(.83,.15,.025),vec3(1.12,.58,.13),hot);
        ember=mix(ember,vec3(1.17,.84,.39),hot*hot);
        gl_FragColor=vec4(ember,density*(.61+.39*flicker));
      }`,
  }))
  smoke.frustumCulled = flame.frustumCulled = false
  smoke.renderOrder = 2
  flame.renderOrder = 3

  const fragment = new T.Shape([
    new T.Vector2(-0.53, -0.37), new T.Vector2(0.38, -0.46), new T.Vector2(0.48, -0.19),
    new T.Vector2(0.24, -0.05), new T.Vector2(0.51, 0.28), new T.Vector2(-0.39, 0.39),
    new T.Vector2(-0.31, 0.11),
  ])
  const debrisPieces = Array.from({ length: 12 }, (_, i) => ({
    x: -55 + i * 9.8 + random() * 6,
    z: 20 + random() * 19,
    heading: random() * Math.PI * 2,
    drift: random() * Math.PI * 2,
    length: 1.15 + random() ** 2 * 3.3,
    width: 0.48 + random() * 1.47,
  }))
  const debris = new T.InstancedMesh(new T.ExtrudeGeometry(fragment, {
    depth: 0.18, bevelEnabled: false,
  }).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ roughness: 0.86, metalness: 0.18 }), debrisPieces.length)
  const debrisColors = ['#654a37', '#374346', '#74766e', '#4c4641']
  debrisPieces.forEach((_, i) => debris.setColorAt(i, new T.Color(debrisColors[i % debrisColors.length])))
  debris.instanceMatrix.setUsage(T.DynamicDrawUsage)
  debris.frustumCulled = false
  const fragmentPose = new T.Object3D()
  root.add(smoke, flame, debris)

  function update(ship: T.Object3D, t: number, reduced: boolean, lowQuality: boolean) {
    fireSites.forEach((site, i) => deckOrigins[i].copy(site).applyMatrix4(ship.matrixWorld))
    uniforms.time.value = reduced ? t * 0.38 : t
    smoke.geometry.instanceCount = (lowQuality ? 7 : 10) * fireSites.length
    debris.count = lowQuality ? 8 : debrisPieces.length
    for (let i = 0; i < debris.count; i++) {
      const piece = debrisPieces[i]
      const sway = t * (reduced ? 0.19 : 0.42) + piece.drift
      const x = ship.position.x + piece.x + Math.sin(sway) * 1.7
      const z = ship.position.z + piece.z + Math.cos(sway * 0.81) * 1.4
      const water = waveHeight(x, z, t)
      fragmentPose.position.set(x, water + 0.015, z)
      fragmentPose.rotation.set(
        waveHeight(x, z + 0.5, t) - waveHeight(x, z - 0.5, t),
        piece.heading + Math.sin(sway) * 0.22,
        waveHeight(x + 0.5, z, t) - waveHeight(x - 0.5, z, t), 'XYZ')
      fragmentPose.scale.set(piece.length, 1, piece.width)
      fragmentPose.updateMatrix()
      debris.setMatrixAt(i, fragmentPose.matrix)
    }
    debris.instanceMatrix.needsUpdate = true
  }
  return { root, update }
}

export function beamGeometry() {
  return new T.CylinderGeometry(0.08, 4.6, 1, 25, 1, true)
}

export function beam(parent: T.Object3D, color = '#ffb45f'): SceneBeam {
  const material = new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    uniforms: { tint: { value: new T.Color(color) }, intensity: { value: 0.5 } },
    vertexShader: `
      varying vec3 normalView, eye;
      varying vec2 tex;
      void main(){
        vec4 p=modelViewMatrix*vec4(position,1.);
        eye=normalize(-p.xyz); normalView=normalize(normalMatrix*normal);
        tex=uv;gl_Position=projectionMatrix*p;
      }`,
    fragmentShader: `
      varying vec3 normalView,eye;
      varying vec2 tex;
      uniform vec3 tint;
      uniform float intensity;
      void main(){
        float edge=pow(clamp(abs(dot(normalView,eye)),.0,1.),1.7);
        gl_FragColor=vec4(tint, intensity*edge*pow(tex.y,.72));
      }`,
  })
  const mesh = new T.Mesh(beamGeometry(), material)
  parent.add(mesh)
  return { mesh, intensity: material.uniforms.intensity as { value: number } }
}

export function placeBeam(mesh: T.Mesh, origin: T.Vector3, target: T.Vector3) {
  mesh.position.copy(origin).lerp(target, 0.5)
  const direction = origin.clone().sub(target)
  mesh.scale.y = direction.length()
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize())
}
