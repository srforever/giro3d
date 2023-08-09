import { ShaderChunk } from 'three';

// We use non camel-case file names to be as consistent as possible with three.js naming scheme
/* eslint-disable camelcase */
import giro3d_outline_pars_fragment from './giro3d_outline_pars_fragment.glsl';
import giro3d_outline_fragment from './giro3d_outline_fragment.glsl';
import giro3d_compose_layers_fragment from './giro3d_compose_layers_fragment.glsl';
import giro3d_compose_layers_pars_fragment from './giro3d_compose_layers_pars_fragment.glsl';
import giro3d_slope_aspect_pars from './giro3d_slope_aspect_pars.glsl';
import giro3d_colormap_pars_fragment from './giro3d_colormap_pars_fragment.glsl';

export default function registerChunks() {
    ShaderChunk.giro3d_outline_pars_fragment = giro3d_outline_pars_fragment;
    ShaderChunk.giro3d_outline_fragment = giro3d_outline_fragment;
    ShaderChunk.giro3d_compose_layers_fragment = giro3d_compose_layers_fragment;
    ShaderChunk.giro3d_compose_layers_pars_fragment = giro3d_compose_layers_pars_fragment;
    ShaderChunk.giro3d_slope_aspect_pars = giro3d_slope_aspect_pars;
    ShaderChunk.giro3d_colormap_pars_fragment = giro3d_colormap_pars_fragment;
}
/* eslint-enable camelcase */
