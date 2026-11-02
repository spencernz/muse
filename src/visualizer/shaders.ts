export const vertexShader=`attribute vec2 a_position; varying vec2 v_uv; void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
export const fragmentShader=`precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_time,u_flow,u_bass,u_mids,u_treble,u_rms,u_intensity;
uniform vec3 u_a,u_b,u_c;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;mat2 m=mat2(.8,-.6,.6,.8);for(int i=0;i<5;i++){s+=a*noise(p);p=m*p*2.04+vec2(3.1,1.7);a*=.5;}return s;}
void main(){
 vec2 uv=v_uv;float aspect=u_size.x/u_size.y;vec2 p=(uv-.5)*vec2(aspect,1.)*2.;float bass=clamp(u_bass*u_intensity,0.,1.4);float mid=clamp(u_mids*u_intensity,0.,1.4);float high=clamp(u_treble*u_intensity,0.,1.4);float energy=clamp(u_rms*u_intensity,0.,1.4);
 vec3 col=vec3(.018,.021,.03);
   float x=p.x;float y=uv.y;float height=.5+bass*.3+energy*.2;
   // Keep the noise field stable; bass expands the envelope rather than resampling it.
   vec2 q=vec2(x*2.6,y*4.8);
   float flow=u_flow;
   vec2 warp=vec2(fbm(q+vec2(0.,-flow)),fbm(q*1.3+vec2(6.,-flow*.8)));
   float turbulence=fbm(q*2.2+warp*2.4+vec2(0.,-flow*1.7));
   float centre=x+sin(y*6.-flow)*(.07+mid*.05)+(warp.x-.5)*(.45+high*.2);
   float shape=1.-abs(centre)*1.3-y/max(.3,height)+(turbulence-.48)*.65;
   float flame=smoothstep(0.,.65,shape)*(1.-smoothstep(.65,1.,y))*(.6+noise(q*4.+vec2(0.,-flow))* .5);
   float core=pow(clamp(shape-.25,0.,1.),2.2);
   col=vec3(.015,.008,.012)+u_b*flame*.55+u_a*pow(flame,2.)*.9+u_c*core*(1.2+energy*.4);
   col+=u_a*exp(-abs(centre)*4.-y*3.)*(.04+bass*.08);

 float vignette=1.-smoothstep(.3,1.25,length((uv-.5)*1.35));
 col*=.48+.52*vignette;col=1.-exp(-col*1.25);gl_FragColor=vec4(col,1.);
}`;
