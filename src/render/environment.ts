import * as T from 'three'
import { seededRandom } from '../core/math'
import { boatLungeTiming, harbor } from '../sim/boat'
import { waterGlsl, waveAmplitude, waveHeight, waveUniforms } from '../sim/water'

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
  mooring: { value: T.Vector4 }
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
  const { minX, maxX, minZ, maxZ } = harbor.mooring
  return {
    time: { value: 0 }, dawn: { value: 0 }, flash: { value: 0 },
    fog: { value: 0.0048 }, contact: { value: new T.Vector3(-14, 0, 0) },
    search: { value: 0 }, sunDirection: { value: new T.Vector3(-0.34, 0.11, -0.93).normalize() },
    shoal: { value: new T.Vector4(0, 0, 1, 1) },
    mooring: { value: new T.Vector4((minX + maxX) / 2, -(minZ + maxZ) / 2, (maxX - minX) / 2, (maxZ - minZ) / 2) },
    boardFoam: { value: new T.Vector3() },
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
    uniforms: { ...uniforms, ...waveUniforms, waterDetail: { value: waterDetailTexture() },
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
      uniform vec4 shoal, mooring, hullFoamPose;
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
        vec2 fromBerth = p - mooring.xy;
        if (all(lessThan(abs(fromBerth), mooring.zw + vec2(1.4)))) {
          float edge = boxEdge(fromBerth, mooring.zw);
          float fill = 1. - smoothstep(-.24, .15, edge);
          float border = 1. - smoothstep(.08, .48, abs(edge + .13));
          float spill = exp(-abs(edge) * 3.1);
          vec3 yellow = vec3(1., .78, .18);
          color = mix(color, yellow, fill * (.25 + .085 * grain));
          color += yellow * (border * (.41 + .13 * grain) + spill * .082);
        }
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

  root.add(smoke, flame)

  function update(ship: T.Object3D, t: number, reduced: boolean, lowQuality: boolean) {
    fireSites.forEach((site, i) => deckOrigins[i].copy(site).applyMatrix4(ship.matrixWorld))
    uniforms.time.value = reduced ? t * 0.38 : t
    smoke.geometry.instanceCount = (lowQuality ? 7 : 10) * fireSites.length
  }
  return { root, update }
}

function debrisSlab(outline: [number, number][], depth: number, fold = 0) {
  const shape = new T.Shape(outline.map(([x, z]) => new T.Vector2(x, -z)))
  const geometry = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
    .rotateX(-Math.PI / 2).translate(0, -depth / 2, 0)
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox!
  const size = bounds.getSize(new T.Vector3())
  const { position, uv } = geometry.attributes
  for (let i = 0; i < position.count; i++) {
    const u = (position.getX(i) - bounds.min.x) / size.x
    const v = (position.getZ(i) - bounds.min.z) / size.z
    uv.setXY(i, u, 1 - v)
    position.setY(i, position.getY(i) + fold * Math.sin(Math.PI * u) * (1 - 1.4 * v))
  }
  geometry.computeVertexNormals()
  return geometry
}

function debrisLathe(profile: [number, number][], horizontal = true) {
  const geometry = new T.LatheGeometry(profile.map(([y, radius]) => new T.Vector2(radius, y)), 10)
  return horizontal ? geometry.rotateZ(-Math.PI / 2) : geometry
}

type DebrisPaint = (ctx: CanvasRenderingContext2D, random: () => number) => void

function debrisTexture(base: string, paint: DebrisPaint) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const random = seededRandom(615)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 64, 64)
  paint(ctx, random)
  // Break up each surface with chips, scratches and sun-faded spots.
  for (let i = 0; i < 150; i++) {
    ctx.fillStyle = i % 3 === 0 ? '#fff2c733' : '#211d182f'
    ctx.fillRect(random() * 64, random() * 64, 1 + random() * 4, 1 + random() * 2)
  }
  const texture = new T.CanvasTexture(canvas)
  texture.colorSpace = T.SRGBColorSpace
  return texture
}

const woodGrain: DebrisPaint = (ctx, random) => {
  for (let i = 0; i < 38; i++) {
    const x = random() * 64 - 18
    const y = random() * 64
    ctx.strokeStyle = i % 3 === 0 ? '#e1ac75aa' : '#3a251977'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(x + 16, y + 4, x + 22, y - 5, x + 49, y + 1)
    ctx.stroke()
  }
}

function wreckDebrisTypes() {
  // Counts for the wreck and board fields. Float offset places the mesh center above or below the waves.
  function type(name: string, geometry: T.BufferGeometry, base: string, paint: DebrisPaint,
    wreckCount: number, boardCount: number, floatOffset = 0) {
    return { name, geometry, material: new T.MeshStandardMaterial({ map: debrisTexture(base, paint), roughness: 0.83 }),
      wreckCount, boardCount, floatOffset }
  }
  return [
    type('Broken planks', debrisSlab([[-1.65,-.24], [1.53,-.22], [1.23,-.05], [1.64,.12],
      [1.19,.22], [-1.53,.21], [-1.24,.04]], .14), '#9a6c45', woodGrain, 9, 8, .035),
    type('Splintered timbers', debrisSlab([[-1.35,-.38], [1.01,-.4], [1.41,-.22], [.95,-.04],
      [1.49,.09], [.85,.38], [-1.35,.32], [-1.11,.04]], .32), '#75492e', woodGrain, 8, 3),
    type('Crates', new T.BoxGeometry(1.43, .82, 1.15), '#937043', (ctx, random) => {
      ctx.fillStyle = '#513b27'
      for (const x of [13, 26, 39, 52]) ctx.fillRect(x, 0, 2, 64)
      ctx.fillStyle = '#c09561'
      ctx.fillRect(0, 4, 64, 7)
      ctx.fillRect(0, 54, 64, 7)
      woodGrain(ctx, random)
      ctx.fillStyle = '#433732'
      for (const x of [6, 57]) for (const y of [6, 56]) ctx.fillRect(x, y, 2, 3)
    }, 2, 1, -.09),
    type('Barrels', debrisLathe([[-.69,0], [-.69,.45], [-.56,.49], [0,.54], [.56,.49], [.69,.45], [.69,0]]),
      '#875148', ctx => {
        ctx.fillStyle = '#403b37'
        for (const y of [10, 44]) ctx.fillRect(0, y, 64, 9)
        ctx.fillStyle = '#b4a18a'
        for (const y of [10, 44]) ctx.fillRect(0, y, 64, 2)
        ctx.fillRect(15, 23, 18, 13)
      }, 1, 1, -.14),
    type('Suitcases', debrisSlab([[-.71,-.44], [.65,-.44], [.74,-.34], [.74,.33], [.64,.44],
      [-.64,.44], [-.74,.32], [-.74,-.33]], .35), '#55526a', ctx => {
      ctx.fillStyle = '#aba1a94d'
      for (let y = 0; y < 64; y += 3) ctx.fillRect(0, y, 64, 1)
      ctx.strokeStyle = '#2b2221'
      ctx.strokeRect(3, 3, 58, 58)
      for (const x of [12, 46]) {
        ctx.fillStyle = '#644334'
        ctx.fillRect(x, 0, 7, 64)
        ctx.fillStyle = '#c2aa79'
        ctx.strokeStyle = '#c2aa79'
        ctx.strokeRect(x - 1, 36, 9, 7)
        ctx.fillRect(x + 3, 37, 1, 5)
      }
      ctx.fillStyle = '#d9be8f'
      ctx.fillRect(35, 10, 11, 7)
    }, 2, 0, -.03),
    type('Cans', debrisLathe([[-.27,0], [-.27,.19], [-.22,.19], [.22,.19], [.27,.19], [.27,0]]),
      '#a84d40', ctx => {
        ctx.fillStyle = '#bbbdb1'
        ctx.fillRect(0, 0, 64, 15)
        ctx.fillRect(0, 49, 64, 15)
        ctx.fillStyle = '#f4dfb7'
        ctx.fillRect(8, 23, 42, 9)
      }, 2, 1, -.035),
    type('Buoys', debrisLathe([[-.38,0], [-.37,.19], [-.17,.37], [.16,.39], [.38,.24], [.49,.11], [.49,0]], false),
      '#c86a2d', ctx => {
        ctx.fillStyle = '#dcd6ad'
        ctx.fillRect(0, 25, 64, 14)
        ctx.fillStyle = '#59402b'
        ctx.fillRect(18, 29, 7, 7)
        ctx.fillRect(33, 29, 10, 7)
      }, 1, 1, -.10),
    type('Crumpled bags', debrisSlab([[-.47,-.25], [-.04,-.36], [.25,-.29], [.46,-.07], [.28,.32],
      [-.06,.26], [-.45,.33], [-.34,.06]], .075, .18), '#b6c6b7', ctx => {
      ctx.strokeStyle = '#677f7a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(2, 39)
      ctx.lineTo(27, 19)
      ctx.lineTo(34, 36)
      ctx.lineTo(58, 25)
      ctx.stroke()
      ctx.fillStyle = '#6a937b'
      ctx.fillRect(21, 39, 29, 6)
    }, 2, 1, .025),
    type('Bottles', debrisLathe([[-.45,0], [-.45,.15], [-.35,.16], [.11,.16], [.25,.075], [.40,.075],
      [.40,.094], [.47,.094], [.47,0]]), '#719e8b', ctx => {
      ctx.fillStyle = '#b2c79e'
      ctx.fillRect(0, 31, 64, 21)
      ctx.fillStyle = '#385b72'
      ctx.fillRect(0, 0, 64, 16)
      ctx.fillRect(7, 40, 42, 4)
    }, 2, 1, -.005),
    type('Wrappers', debrisSlab([[-.34,-.25], [.06,-.19], [.34,-.24], [.27,.09], [.34,.24],
      [-.06,.19], [-.34,.22], [-.26,-.06]], .035, .105), '#b78445', ctx => {
      ctx.fillStyle = '#855041'
      ctx.fillRect(0, 0, 10, 64)
      ctx.fillRect(54, 0, 10, 64)
      ctx.fillStyle = '#ead9a9'
      ctx.fillRect(15, 22, 34, 16)
      ctx.fillRect(23, 43, 21, 3)
    }, 1, 1, .045),
    type('Loose scraps', debrisSlab([[-.36,-.22], [-.03,-.31], [.35,-.16], [.16,-.02], [.31,.15],
      [.03,.28], [-.34,.14]], .035, .095), '#cfc4a6', ctx => {
      ctx.fillStyle = '#827d71'
      for (let y = 15; y < 55; y += 7) ctx.fillRect(12, y, y % 2 ? 32 : 23, 2)
    }, 1, 2, .045),
  ]
}

export function wreckDebris() {
  const root = new T.Group()
  root.name = 'Floating wreck debris'
  const random = seededRandom(200)
  type Field = 'wreck' | 'board'
  const used: Record<Field, { x: number; z: number; radius: number }[]> = { wreck: [], board: [] }

  function scatter(count: number, field: Field, radius: number) {
    const sites = used[field]
    const nearWreck = field === 'wreck'
    return Array.from({ length: count }, (_, i) => {
      const size = 0.64 + random() * 0.58
      const footprint = radius * size
      let spot = { x: 0, z: 0, radius: footprint }
      let bestGap = -Infinity
      // Give pieces a little clearance from each other and leave the pickup area open.
      for (let attempt = 0; attempt < 8; attempt++) {
        const x = nearWreck ? -38 + random() * 77 : -23 + random() * 49
        const z = nearWreck ? 24 + random() * 15 : (7 + random() * 11) * (i % 2 ? 1 : -1)
        const gap = sites.reduce((min, site) => Math.min(min,
          Math.hypot(x - site.x, z - site.z) - footprint - site.radius), Infinity)
        if (gap > bestGap) {
          bestGap = gap
          spot = { x, z, radius: footprint }
        }
      }
      sites.push(spot)
      return { ...spot, field, size, heading: random() * Math.PI * 2, sway: random() * Math.PI * 2,
        low: i < Math.ceil(count * 0.58), tint: 0.81 + random() * 0.28 }
    })
  }

  const batches = wreckDebrisTypes().map(({ name, geometry, material, wreckCount, boardCount, floatOffset }) => {
    geometry.computeBoundingSphere()
    const radius = geometry.boundingSphere!.radius
    const pieces = [...scatter(wreckCount, 'wreck', radius), ...scatter(boardCount, 'board', radius)]
      .sort((a, b) => Number(b.low) - Number(a.low))
    const mesh = new T.InstancedMesh(geometry, material, pieces.length)
    mesh.name = name
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage)
    const color = new T.Color()
    pieces.forEach((piece, i) => mesh.setColorAt(i, color.setRGB(piece.tint, piece.tint, piece.tint)))
    root.add(mesh)
    return { mesh, pieces, lowCount: pieces.filter(piece => piece.low).length, floatOffset }
  })
  const pose = new T.Object3D()
  const up = new T.Vector3(0, 1, 0)
  const normal = new T.Vector3()
  const yaw = new T.Quaternion()
  const slope = { x: 0, z: 0 }

  function update(ship: T.Vector3, board: T.Vector3, t: number, reduced: boolean, lowQuality: boolean) {
    const anchors = { wreck: ship, board }
    for (const { mesh, pieces, lowCount, floatOffset } of batches) {
      mesh.count = lowQuality ? lowCount : pieces.length
      for (let i = 0; i < mesh.count; i++) {
        const piece = pieces[i]
        const anchor = anchors[piece.field]
        const sway = t * (reduced ? 0.14 : 0.35) + piece.sway
        const x = anchor.x + piece.x + Math.sin(sway) * 0.74
        const z = anchor.z + piece.z + Math.cos(sway * 0.83) * 0.58
        const height = waveHeight(x, z, t, slope)
        pose.position.set(x, height + floatOffset * piece.size, z)
        normal.set(-slope.x, 1, -slope.z).normalize()
        yaw.setFromAxisAngle(up, piece.heading + Math.sin(sway) * 0.22)
        pose.quaternion.setFromUnitVectors(up, normal).multiply(yaw)
        pose.scale.setScalar(piece.size)
        pose.updateMatrix()
        mesh.setMatrixAt(i, pose.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
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

export function lanternGlow(parent: T.Object3D, origin: T.Vector3) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 48
  const context = canvas.getContext('2d')!
  const glow = context.createRadialGradient(24, 24, 0, 24, 24, 24)
  glow.addColorStop(0, '#fff4c6')
  glow.addColorStop(0.20, '#ffd991dd')
  glow.addColorStop(0.53, '#ffb75059')
  glow.addColorStop(1, '#ffb75000')
  context.fillStyle = glow
  context.fillRect(0, 0, 48, 48)
  const map = new T.CanvasTexture(canvas)
  map.colorSpace = T.SRGBColorSpace
  const light = new T.Sprite(new T.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: T.AdditiveBlending }))
  light.name = 'Lantern Glow'
  light.position.copy(origin)
  light.scale.set(3.1, 3.1, 1)
  parent.add(light)
}
