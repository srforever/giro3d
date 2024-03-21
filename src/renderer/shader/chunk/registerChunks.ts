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

type Giro3DShaderChunk = typeof ShaderChunk & {
    giro3d_common: string;
    giro3d_outline_pars_fragment: string;
    giro3d_outline_fragment: string;
    giro3d_precision_qualifiers: string;
    giro3d_compose_layers_fragment: string;
    giro3d_compose_layers_pars_fragment: string;
    giro3d_colormap_pars_fragment: string;
    giro3d_contour_line_pars_fragment: string;
    giro3d_contour_line_fragment: string;
    giro3d_fragment_shader_header: string;
};

export default function registerChunks() {
    const Giro3dShaderChunk = ShaderChunk as Giro3DShaderChunk;
    Giro3dShaderChunk.giro3d_precision_qualifiers = giro3d_precision_qualifiers;
    Giro3dShaderChunk.giro3d_common = giro3d_common;
    Giro3dShaderChunk.giro3d_outline_pars_fragment = giro3d_outline_pars_fragment;
    Giro3dShaderChunk.giro3d_outline_fragment = giro3d_outline_fragment;
    Giro3dShaderChunk.giro3d_compose_layers_fragment = giro3d_compose_layers_fragment;
    Giro3dShaderChunk.giro3d_compose_layers_pars_fragment = giro3d_compose_layers_pars_fragment;
    Giro3dShaderChunk.giro3d_colormap_pars_fragment = giro3d_colormap_pars_fragment;
    Giro3dShaderChunk.giro3d_contour_line_pars_fragment = giro3d_contour_line_pars_fragment;
    Giro3dShaderChunk.giro3d_contour_line_fragment = giro3d_contour_line_fragment;
    Giro3dShaderChunk.giro3d_fragment_shader_header = giro3d_fragment_shader_header;
}
/* eslint-enable camelcase */
