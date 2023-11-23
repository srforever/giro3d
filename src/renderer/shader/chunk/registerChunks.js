import { ShaderChunk } from 'three';

// We use non camel-case file names to be as consistent as possible with three.js naming scheme
/* eslint-disable camelcase */
import giro3d_common from './giro3d_common.glsl';
import giro3d_outline_pars_fragment from './giro3d_outline_pars_fragment.glsl';
import giro3d_outline_fragment from './giro3d_outline_fragment.glsl';
import giro3d_compose_layers_fragment from './giro3d_compose_layers_fragment.glsl';
import giro3d_compose_layers_pars_fragment from './giro3d_compose_layers_pars_fragment.glsl';
import giro3d_colormap_pars_fragment from './giro3d_colormap_pars_fragment.glsl';
import giro3d_precision_qualifiers from './giro3d_precision_qualifiers.glsl';
import giro3d_contour_line_pars_fragment from './giro3d_contour_line_pars_fragment.glsl';
import giro3d_contour_line_fragment from './giro3d_contour_line_fragment.glsl';
import giro3d_fragment_shader_header from './giro3d_fragment_shader_header.glsl';

export default function registerChunks() {
    ShaderChunk.giro3d_precision_qualifiers = giro3d_precision_qualifiers;
    ShaderChunk.giro3d_common = giro3d_common;
    ShaderChunk.giro3d_outline_pars_fragment = giro3d_outline_pars_fragment;
    ShaderChunk.giro3d_outline_fragment = giro3d_outline_fragment;
    ShaderChunk.giro3d_compose_layers_fragment = giro3d_compose_layers_fragment;
    ShaderChunk.giro3d_compose_layers_pars_fragment = giro3d_compose_layers_pars_fragment;
    ShaderChunk.giro3d_colormap_pars_fragment = giro3d_colormap_pars_fragment;
    ShaderChunk.giro3d_contour_line_pars_fragment = giro3d_contour_line_pars_fragment;
    ShaderChunk.giro3d_contour_line_fragment = giro3d_contour_line_fragment;
    ShaderChunk.giro3d_fragment_shader_header = giro3d_fragment_shader_header;
}
/* eslint-enable camelcase */
