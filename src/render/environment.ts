import * as T from 'three'
import { waterGlsl } from '../sim/water'

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
