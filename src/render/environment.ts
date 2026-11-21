import * as T from 'three'
import { seededRandom } from '../core/math'
import { waterGlsl, waveHeight } from '../sim/water'

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

export type SceneUniforms = {
  time: { value: number }
  dawn: { value: number }
  flash: { value: number }
  fog: { value: number }
  contact: { value: T.Vector3 }
  search: { value: number }
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
    search: { value: 0.0 },
  }
}

export function seaGeometry() {
  const geom = new T.PlaneGeometry(2, 2, 176, 176)
  geom.rotateX(-Math.PI / 2)
  const vertices = geom.attributes.position
  for (let i = 0; i < vertices.count; i++) {
    const shape = (n: number) => 138 * n + 1300 * n ** 7
    vertices.setXYZ(i, shape(vertices.getX(i)), 0, shape(vertices.getZ(i)))
  }
  return geom
}

export function environment(scene: T.Scene): SceneEnvironment {
  const uniforms = environmentSettings()
  const sea = new T.Mesh(seaGeometry(), new T.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float time;
      varying vec3 world;
      ${waterGlsl}
      void main(){
        world=(modelMatrix*vec4(position,1.)).xyz;
        world.y=oceanSample(world.xz,time).x;
        gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
      }
    `,
    fragmentShader: `
      uniform float time,dawn,flash,fog,search;
      uniform vec3 contact;
      varying vec3 world;
      ${waterGlsl}
      ${noise}
      void main(){
        vec2 p=world.xz;
        vec3 w=oceanSample(p,time);
        vec2 micro=vec2(
          sin(p.x*2.8+p.y*1.3-time*2.6) + .34*sin(p.y*9.-p.x*6.+time*4.1),
          cos(p.y*2.4-p.x*.8+time*2.5) + .34*sin(p.y*6.+p.x*3.-time*5.)
        );
        float dist=length(cameraPosition-world);
        float closeFade=1.-smoothstep(90.,250.,dist);
        vec3 n=normalize(vec3(-w.y+.07*micro.x*closeFade,1.,-w.z+.07*micro.y*closeFade));
        vec3 v=normalize(cameraPosition-world);
        float fresnel=pow(1.-max(0.,dot(n,v)),3.25);
        vec3 storm=vec3(.024,.115,.145);
        vec3 col=mix(storm*mix(.54,1.48,clamp(.51+w.x*.48,0.,1.)),vec3(.19,.34,.39),fresnel*.63);
        float fleck=fbm(p*1.06+vec2(time*.15,-time*.089));
        float ridge=smoothstep(.41,.84,w.x+.18*noise2(p*.31));
        float detail=smoothstep(.41,.77,fleck);
        float fizz=smoothstep(.47,.71,noise2(p*4.5+vec2(.31,-.13)*time));
        float foam=ridge*(.05+.70*detail+.19*fizz)+smoothstep(.70,.91,fleck)*smoothstep(.12,.55,w.x)*.43;
        float rotor=exp(-abs(length(p-contact.xz)-7.)*.76)*(.16+.43*fleck)*search;
        col=mix(col,vec3(.58,.73,.71),clamp(foam+rotor,0.,.68));
        float pool=exp(-dot(p-contact.xz,p-contact.xz)*.031)*search;
        col+=vec3(.43,.23,.075)*pool*(.3+.7*detail);
        vec3 beam=normalize(vec3(.52,.22,-.83));
        float spec=pow(max(0.,dot(n,normalize(v+beam))),27.);
        col+=spec*mix(vec3(.18,.30,.34),vec3(.55,.36,.15),dawn);
        col+=vec3(.2,.28,.35)*flash*(.24+spec);
        float mist=1.-exp(-dist*fog);
        vec3 horizon=mix(vec3(.200,.316,.358),vec3(.55,.42,.31),dawn);
        gl_FragColor=vec4(mix(col,horizon,clamp(mist,.0,1.)),1.);
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
      varying vec3 ray;
      ${noise}
      void main() {
        vec3 dir=normalize(ray);
        float y=max(0.,dir.y);
        vec2 p=dir.xz/(.31+y)*2.7;
        float cloud=fbm(p+vec2(.009*time,-.004*time));
        float bands=fbm(p*.42+cloud*.51);
        vec3 horizon=mix(vec3(.200,.316,.358), vec3(.55,.42,.31), dawn);
        vec3 zenith=mix(vec3(.024,.083,.124), vec3(.15,.26,.31), dawn);
        vec3 col=mix(horizon,zenith,smoothstep(0.,.65,y));
        col*=mix(.58,1.24,smoothstep(.195,.70,cloud*.72+bands*.28));
        float sunset=pow(max(0.,dot(dir,normalize(vec3(-.34,.035,-.93)))),12.)*exp(-y*6.);
        col+=mix(vec3(.115,.066,.035),vec3(.61,.32,.10),dawn)*sunset;
        col=mix(horizon,col,smoothstep(0.,.038,y));
        col+=vec3(.30,.39,.51)*flash*(.4+cloud);
        gl_FragColor=vec4(col,1.);
      }
    `,
  }))
  sky.renderOrder = -10
  scene.add(sky)
  return { sea, sky, uniforms }
}

function particleNoiseTexture() {
  const size = 64, cells = 8, cellSize = size / cells
  const random = seededRandom(68)
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
  const texture = new T.DataTexture(pixels, size, size, T.RedFormat)
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
