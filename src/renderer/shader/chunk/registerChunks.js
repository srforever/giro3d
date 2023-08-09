import { ShaderChunk } from 'three';

// We use non camel-case file names to be as consistent as possible with three.js naming scheme
/* eslint-disable camelcase */
import giro3d_outline_pars_fragment from './giro3d_outline_pars_fragment.glsl';
import giro3d_outline_fragment from './giro3d_outline_fragment.glsl';

export default function registerChunks() {
    ShaderChunk.giro3d_outline_pars_fragment = giro3d_outline_pars_fragment;
    ShaderChunk.giro3d_outline_fragment = giro3d_outline_fragment;
}
/* eslint-enable camelcase */
