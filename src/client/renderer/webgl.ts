/**
 * WebGL Renderer
 *
 * The WebGL renderer works much like the Direct2D renderer, but uses WebGL to accomplish it.
 * The advantage is that we can draw individual tiles, but actually feed them in large batches to
 * the graphics hardware using Vertex Buffer Objects (VBO). Another advantage is that we can do all
 * the styling we need in a fragment shader.
 *
 * All in all, this is the least CPU intensive drawing method, but strangely not the smoothest.
 */

import { BaseRenderer } from './base';
import { TILE_SIZE_PIXELS, PIXEL_SIZE_WORLD } from '../../constants';
import TEAM_COLORS from '../../team_colors';

const { round, floor, ceil } = Math;

// Shaders

/**
 * The vertex shader simply applies the transformation matrix, and interpolates texture coordinates.
 */
const VERTEX_SHADER = `
  /* Input variables. */
  attribute vec2 aVertexCoord;
  attribute vec2 aTextureCoord;
  uniform mat4 uTransform;

  /* Output variables. */
  /* implicit vec4 gl_Position; */
  varying vec2 vTextureCoord;

  void main(void) {
    gl_Position = uTransform * vec4(aVertexCoord, 0.0, 1.0);
    vTextureCoord = aTextureCoord;
  }
`;

/**
 * The fragment shader makes the decision which tilemap to sample from, and combines the styled
 * tilemap with the styling overlay. Three texture units are used.
 */
const FRAGMENT_SHADER = `
  #ifdef GL_ES
  precision highp float;
  #endif

  /* Input variables. */
  varying vec2 vTextureCoord;
  uniform sampler2D uBase;
  uniform sampler2D uStyled;
  uniform sampler2D uOverlay;
  uniform bool uUseStyled;
  uniform bool uIsStyled;
  uniform vec3 uStyleColor;

  /* Output variables. */
  /* implicit vec4 gl_FragColor; */

  void main(void) {
    if (uUseStyled) {
      vec4 base = texture2D(uStyled, vTextureCoord);
      if (uIsStyled) {
        float alpha = texture2D(uOverlay, vTextureCoord).r;
        gl_FragColor = vec4(
            mix(base.rgb, uStyleColor, alpha),
            clamp(base.a + alpha, 0.0, 1.0)
        );
      }
      else {
        gl_FragColor = base;
      }
    }
    else {
      gl_FragColor = texture2D(uBase, vTextureCoord);
    }
  }
`;

/**
 * Helper function that is used to compile the above shaders.
 */
function compileShader(ctx: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = ctx.createShader(type);
  if (!shader) {
    throw new Error('Could not create shader');
  }
  ctx.shaderSource(shader, source);
  ctx.compileShader(shader);
  if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
    throw new Error(`Could not compile shader: ${ctx.getShaderInfoLog(shader)}`);
  }
  return shader;
}

// Renderer

export class WebglRenderer extends BaseRenderer {
  ctx!: WebGLRenderingContext;
  program!: WebGLProgram;
  aVertexCoord!: number;
  aTextureCoord!: number;
  uTransform!: WebGLUniformLocation | null;
  uBase!: WebGLUniformLocation | null;
  uStyled!: WebGLUniformLocation | null;
  uOverlay!: WebGLUniformLocation | null;
  uUseStyled!: WebGLUniformLocation | null;
  uIsStyled!: WebGLUniformLocation | null;
  uStyleColor!: WebGLUniformLocation | null;
  hTileSizeTexture!: number;
  vTileSizeTexture!: number;
  hStyledTileSizeTexture!: number;
  vStyledTileSizeTexture!: number;
  transformArray!: Float32Array;
  vertexArray!: Float32Array;
  vertexBuffer!: WebGLBuffer;

  setup(): void {
    // Initialize the canvas.
    try {
      const context = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
      if (!context) {
        throw new Error('Could not get WebGL context');
      }
      this.ctx = context as WebGLRenderingContext;
      // Just access it, see if it throws.
      this.ctx.bindBuffer;
    } catch (e: any) {
      throw new Error(`Could not initialize WebGL canvas: ${e.message}`);
    }

    // This makes WebGL calls feel slightly more natural.
    const gl = this.ctx;

    // We use 2D textures and blending.
    // gl.enable(gl.TEXTURE_2D)  // Illegal and not required in WebGL / GLES 2.0.
    gl.enable(gl.BLEND);

    // When blending, apply the source's alpha channel.
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Create and permanently bind the tilemap texture into texture unit 0.
    const images = [this.images.base, this.images.styled, this.images.overlay];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      gl.activeTexture(gl.TEXTURE0 + i);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // No scaling should ever be necessary, so pick the fastest algorithm.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      // This should prevent overflowing between tiles at least at the edge of the tilemap.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // Load the tilemap data into the texture
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    }

    // Preparations for drawTile. Calculate the tile size in the texture coordinate space.
    this.hTileSizeTexture = TILE_SIZE_PIXELS / this.images.base.width;
    this.vTileSizeTexture = TILE_SIZE_PIXELS / this.images.base.height;
    // And again for drawStyledTile.
    this.hStyledTileSizeTexture = TILE_SIZE_PIXELS / this.images.styled.width;
    this.vStyledTileSizeTexture = TILE_SIZE_PIXELS / this.images.styled.height;

    // Compile the shaders.
    const program = gl.createProgram();
    if (!program) {
      throw new Error('Could not create program');
    }
    this.program = program;
    gl.attachShader(this.program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(this.program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Could not link shaders: ${gl.getProgramInfoLog(this.program)}`);
    }
    gl.useProgram(this.program);

    // Store the shader inputs we need to be able to fill.
    this.aVertexCoord = gl.getAttribLocation(this.program, 'aVertexCoord');
    this.aTextureCoord = gl.getAttribLocation(this.program, 'aTextureCoord');
    this.uTransform = gl.getUniformLocation(this.program, 'uTransform');
    this.uBase = gl.getUniformLocation(this.program, 'uBase');
    this.uStyled = gl.getUniformLocation(this.program, 'uStyled');
    this.uOverlay = gl.getUniformLocation(this.program, 'uOverlay');
    this.uUseStyled = gl.getUniformLocation(this.program, 'uUseStyled');
    this.uIsStyled = gl.getUniformLocation(this.program, 'uIsStyled');
    this.uStyleColor = gl.getUniformLocation(this.program, 'uStyleColor');

    // Enable vertex attributes as arrays.
    gl.enableVertexAttribArray(this.aVertexCoord);
    gl.enableVertexAttribArray(this.aTextureCoord);

    // Tell the fragment shader which texture units to use for its uniforms.
    gl.uniform1i(this.uBase, 0);
    gl.uniform1i(this.uStyled, 1);
    gl.uniform1i(this.uOverlay, 2);

    // Allocate the translation matrix, and fill it with the identity matrix.
    // To do all of our transformations, we only need to change 4 elements.
    this.transformArray = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    // Allocate the vertex buffer with room for a bunch of tiles.
    // This will store both vertex coordinates as well as texture coordinates.
    this.vertexArray = new Float32Array(256 * (6 * 4));

    // Create and permanently bind the vertex buffer.
    const vertexBuffer = gl.createBuffer();
    if (!vertexBuffer) {
      throw new Error('Could not create vertex buffer');
    }
    this.vertexBuffer = vertexBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.vertexAttribPointer(this.aVertexCoord, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(this.aTextureCoord, 2, gl.FLOAT, false, 16, 8);
  }

  /**
   * On resize, we update the canvas size, and recalculate the translation matrix. Because this is
   * called at convenient times, we also check the GL error state at this point.
   */
  handleResize(): void {
    super.handleResize();

    this.ctx.viewport(0, 0, window.innerWidth, window.innerHeight);
    this.setTranslation(0, 0);

    this.checkError();
  }

  /**
   * This function checks the GL error state and throws an exception if necessary.
   */
  checkError(): void {
    const gl = this.ctx;
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
      throw new Error(`WebGL error: ${err}`);
    }
  }

  /**
   * Rebuild the translation matrix. The translation matrix accomplishes the following:
   *
   * A. Apply the requested translation by (px,py).
   * B. The WebGL coordinate space runs from -1 to 1. Scale the pixel coordinates to fit in the
   *    range 0 to 2.
   * C. Then translate to fit in the range -1 to 1.
   * D. The WebGL y-axis is inverted compared to what we want. So multiply the y-axis by -1.
   *
   * To chain all this into one matrix, we have to apply these into reverse order. The math then
   * looks as follows:
   *
   *               D                     C                     B                     A
   *     |   1   0   0   0 |   |   1   0   0  -1 |   |  xt   0   0   0 |   |   1   0   0  px |
   * T = |   0  -1   0   0 | x |   0   1   0  -1 | x |   0  xy   0   0 | x |   0   1   0  py |
   *     |   0   0   1   0 |   |   0   0   1   0 |   |   0   0   1   0 |   |   0   0   1   0 |
   *     |   0   0   0   1 |   |   0   0   0   1 |   |   0   0   0   1 |   |   0   0   0   1 |
   *
   * To top that off, WebGL expects things in column major order. So the array indices should be
   * read as being transposed.
   */
  setTranslation(px: number, py: number): void {
    const xt = 2 / window.innerWidth;
    const yt = 2 / window.innerHeight;

    const arr = this.transformArray;
    arr[0] = xt;
    arr[5] = -yt;
    arr[12] = px * xt - 1;
    arr[13] = py * -yt + 1;
    this.ctx.uniformMatrix4fv(this.uTransform, false, arr);
  }

  /**
   * Apply a translation that centers everything around the given coordinates.
   */
  centerOn(x: number, y: number, cb: (left: number, top: number, width: number, height: number) => void): void {
    const [left, top, width, height] = this.getViewAreaAtWorld(x, y);
    this.setTranslation(-left, -top);
    cb(left, top, width, height);
    this.setTranslation(0, 0);
  }

  /**
   * Helper function that adds a tile to an array that is used to prepare the VBO. It takes care
   * of calculating texture coordinates based on tile coordinates `tx` and `ty`, and adds entries
   * for two triangles to the given `buffer` at the given `offset`.
   */
  bufferTile(buffer: Float32Array, offset: number, tx: number, ty: number, styled: boolean, sdx: number, sdy: number): void {
    let stx: number, sty: number, etx: number, ety: number;

    if (styled) {
      stx = tx * this.hStyledTileSizeTexture;
      sty = ty * this.vStyledTileSizeTexture;
      etx = stx + this.hStyledTileSizeTexture;
      ety = sty + this.vStyledTileSizeTexture;
    } else {
      stx = tx * this.hTileSizeTexture;
      sty = ty * this.vTileSizeTexture;
      etx = stx + this.hTileSizeTexture;
      ety = sty + this.vTileSizeTexture;
    }

    const edx = sdx + TILE_SIZE_PIXELS;
    const edy = sdy + TILE_SIZE_PIXELS;

    buffer.set(
      [
        sdx, sdy, stx, sty,
        sdx, edy, stx, ety,
        edx, sdy, etx, sty,
        sdx, edy, stx, ety,
        edx, sdy, etx, sty,
        edx, edy, etx, ety,
      ],
      offset * (6 * 4)
    );
  }

  /**
   * Draw a single tile, unstyled.
   */
  drawTile(tx: number, ty: number, sdx: number, sdy: number): void {
    const gl = this.ctx;
    gl.uniform1i(this.uUseStyled, 0);
    this.bufferTile(this.vertexArray, 0, tx, ty, false, sdx, sdy);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexArray, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * Draw a single tile, styled with a team color.
   */
  drawStyledTile(tx: number, ty: number, style: any, sdx: number, sdy: number): void {
    const gl = this.ctx;
    gl.uniform1i(this.uUseStyled, 1);
    const color = TEAM_COLORS[style];
    if (color) {
      gl.uniform1i(this.uIsStyled, 1);
      gl.uniform3f(this.uStyleColor, color.r / 255, color.g / 255, color.b / 255);
    } else {
      gl.uniform1i(this.uIsStyled, 0);
    }
    this.bufferTile(this.vertexArray, 0, tx, ty, true, sdx, sdy);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexArray, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * When a cell is retiled, we simply store the tile index for the upcoming frames.
   */
  onRetile(cell: any, tx: number, ty: number): void {
    cell.tile = [tx, ty];
  }

  /**
   * Draw the map.
   */
  drawMap(sx: number, sy: number, w: number, h: number): void {
    const gl = this.ctx;

    const ex = sx + w - 1;
    const ey = sy + h - 1;

    // Calculate tile boundaries.
    const stx = floor(sx / TILE_SIZE_PIXELS);
    const sty = floor(sy / TILE_SIZE_PIXELS);
    const etx = ceil(ex / TILE_SIZE_PIXELS);
    const ety = ceil(ey / TILE_SIZE_PIXELS);

    const styledCells: Record<string, any[]> = {};
    let arrayTileIndex = 0;
    const maxTiles = this.vertexArray.length / (6 * 4);

    // Draw the accumulated tiles.
    const flushArray = () => {
      if (arrayTileIndex === 0) return;
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexArray, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, arrayTileIndex * 6);
      arrayTileIndex = 0;
    };

    // Only draw unstyled tiles, but build an index of styled tiles by color.
    gl.uniform1i(this.uUseStyled, 0);
    this.world.map.each(
      (cell: any) => {
        const obj = cell.pill || cell.base;
        if (obj) {
          let style = obj.owner?.$?.team;
          if (!TEAM_COLORS[style]) {
            style = 255;
          }
          (styledCells[style] = styledCells[style] || []).push(cell);
        } else {
          this.bufferTile(this.vertexArray, arrayTileIndex, cell.tile[0], cell.tile[1], false, cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
          if (++arrayTileIndex === maxTiles) {
            flushArray();
          }
        }
      },
      stx,
      sty,
      etx,
      ety
    );
    flushArray();

    // Draw the remaining styled tiles.
    gl.uniform1i(this.uUseStyled, 1);
    for (const [style, cells] of Object.entries(styledCells)) {
      const color = TEAM_COLORS[Number(style)];
      if (color) {
        gl.uniform1i(this.uIsStyled, 1);
        gl.uniform3f(this.uStyleColor, color.r / 255, color.g / 255, color.b / 255);
      } else {
        gl.uniform1i(this.uIsStyled, 0);
      }

      for (const cell of cells) {
        this.bufferTile(this.vertexArray, arrayTileIndex, cell.tile[0], cell.tile[1], true, cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
        if (++arrayTileIndex === maxTiles) {
          flushArray();
        }
      }
      flushArray();
    }
  }

  drawBuilderIndicator(b: any): void {
    // FIXME
  }

  drawNames(): void {
    // FIXME
  }
}

export default WebglRenderer;
