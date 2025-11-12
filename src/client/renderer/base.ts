/**
 * Base Renderer
 *
 * The base class for all renderers is defined here. A renderer is responsible for drawing the map,
 * objects on the map, HUD map overlays and HUD screen overlays. Especially of the last two points,
 * a lot of shared code lives in this base class. Methods that need to be implemented by subclasses
 * are stubbed out here. All renderers also implement the `MapView` interface.
 */

import {
  TILE_SIZE_PIXELS,
  TILE_SIZE_WORLD,
  PIXEL_SIZE_WORLD,
  MAP_SIZE_PIXELS,
} from '../../constants';
import * as sounds from '../../sounds';
import TEAM_COLORS from '../../team_colors';

const { min: mathMin, max: mathMax, round: mathRound, cos: mathCos, sin: mathSin, PI: mathPI, sqrt: mathSqrt } = Math;

export class BaseRenderer {
  world: any;
  images: any;
  soundkit: any;
  canvas: HTMLCanvasElement;
  lastCenter: [number, number];
  mouse: [number, number];
  hud?: HTMLDivElement;
  tankIndicators?: Record<string, HTMLDivElement>;
  pillIndicators?: Array<[HTMLDivElement, any]>;
  baseIndicators?: Array<[HTMLDivElement, any]>;
  playerIndicators?: Array<HTMLDivElement>;
  currentTool: string | null = null;

  /**
   * The constructor takes a reference to the World it needs to draw. Once the constructor finishes,
   * `Map#setView` is called to hook up this renderer instance, which causes onRetile to be invoked
   * once for each tile to initialize.
   */
  constructor(world: any) {
    this.world = world;
    this.images = this.world.images;
    this.soundkit = this.world.soundkit;

    this.canvas = document.createElement('canvas');
    document.body.appendChild(this.canvas);
    this.lastCenter = this.world.map.findCenterCell().getWorldCoordinates();

    this.mouse = [0, 0];
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.canvas.addEventListener('mousemove', (e) => {
      this.mouse = [e.pageX, e.pageY];
    });

    this.setup();

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  /**
   * Subclasses use this as their constructor.
   */
  setup(): void {}

  /**
   * This methods takes x and y coordinates to center the screen on. The callback provided should be
   * invoked exactly once. Any drawing operations used from within the callback will have a
   * translation applied so that the given coordinates become the center on the screen.
   */
  centerOn(x: number, y: number, cb: (left: number, top: number, width: number, height: number) => void): void {}

  /**
   * Draw the tile (tx,ty), which are x and y indices in the base tilemap (and not pixel
   * coordinates), so that the top left corner of the tile is placed at (sdx,sdy) pixel coordinates
   * on the screen. The destination coordinates may be subject to translation from centerOn.
   */
  drawTile(tx: number, ty: number, sdx: number, sdy: number): void {}

  /**
   * Similar to drawTile, but draws from the styled tilemap. Takes an additional parameter `style`,
   * which is a selection from the team colors. The overlay tile is drawn in this color on top of
   * the tile from the styled tilemap. If the style doesn't exist, no overlay is drawn.
   */
  drawStyledTile(tx: number, ty: number, style: any, sdx: number, sdy: number): void {}

  /**
   * Draw the map section that intersects with the given boundary box (sx,sy,w,h). The boundary
   * box is given in pixel coordinates. This may very well be a no-op if the renderer can do all of
   * its work in onRetile.
   */
  drawMap(sx: number, sy: number, w: number, h: number): void {}

  /**
   * Draw an arrow towards the builder. Only called when the builder is outside the tank.
   */
  drawBuilderIndicator(builder: any): void {}

  /**
   * Inherited from MapView.
   */
  onRetile(cell: any, tx: number, ty: number): void {}

  // Common functions

  /**
   * Draw a single frame.
   */
  draw(): void {
    let x: number | null, y: number | null;

    // Check if we're viewing a pillbox instead of the tank
    const viewTarget = this.world.getViewTarget ? this.world.getViewTarget() : null;

    if (viewTarget) {
      // Center on the pillbox
      ({ x, y } = viewTarget);
    } else if (this.world.player) {
      // Center on the player's tank
      ({ x, y } = this.world.player);
      if (this.world.player.fireball) {
        ({ x, y } = this.world.player.fireball.$);
      }
    } else {
      x = y = null;
    }

    // Remember or restore the last center position. We use this after tank
    // death, so as to keep drawing something useful while we fade.
    if (x == null || y == null) {
      [x, y] = this.lastCenter;
    } else {
      this.lastCenter = [x, y];
    }

    this.centerOn(x, y, (left, top, width, height) => {
      // Draw all canvas elements.
      this.drawMap(left, top, width, height);
      for (const obj of this.world.objects) {
        // Skip null objects (destroyed objects remain as null in the array)
        if (!obj) continue;

        // Skip hidden tanks (except for the local player's own tank)
        if (obj.hidden && obj !== this.world.player) continue;

        if (obj.styled != null && obj.x != null && obj.y != null) {
          const [tx, ty] = obj.getTile();
          const ox = mathRound(obj.x / PIXEL_SIZE_WORLD) - TILE_SIZE_PIXELS / 2;
          const oy = mathRound(obj.y / PIXEL_SIZE_WORLD) - TILE_SIZE_PIXELS / 2;
          if (obj.styled === true) {
            this.drawStyledTile(tx, ty, obj.team, ox, oy);
          } else if (obj.styled === false) {
            this.drawTile(tx, ty, ox, oy);
          }
        }
      }
      this.drawOverlay();
    });

    // Update all DOM HUD elements.
    if (this.hud) {
      this.updateHud();
    }
  }

  /**
   * Play a sound effect.
   */
  playSound(sfx: number, x: number, y: number, owner: any): void {
    let mode: string;

    if (this.world.player && owner === this.world.player) {
      mode = 'Self';
    } else {
      const dx = x - this.lastCenter[0];
      const dy = y - this.lastCenter[1];
      const dist = mathSqrt(dx * dx + dy * dy);
      if (dist > 40 * TILE_SIZE_WORLD) {
        mode = 'None';
      } else if (dist > 15 * TILE_SIZE_WORLD) {
        mode = 'Far';
      } else {
        mode = 'Near';
      }
    }

    if (mode === 'None') return;

    let name: string | undefined;
    switch (sfx) {
      case sounds.BIG_EXPLOSION:
        name = `bigExplosion${mode}`;
        break;
      case sounds.BUBBLES:
        name = mode === 'Self' ? 'bubbles' : undefined;
        break;
      case sounds.FARMING_TREE:
        name = `farmingTree${mode}`;
        break;
      case sounds.HIT_TANK:
        name = `hitTank${mode}`;
        break;
      case sounds.MAN_BUILDING:
        name = `manBuilding${mode}`;
        break;
      case sounds.MAN_DYING:
        name = `manDying${mode}`;
        break;
      case sounds.MAN_LAY_MINE:
        name = mode === 'Near' ? 'manLayMineNear' : undefined;
        break;
      case sounds.MINE_EXPLOSION:
        name = `mineExplosion${mode}`;
        break;
      case sounds.SHOOTING:
        name = `shooting${mode}`;
        break;
      case sounds.SHOT_BUILDING:
        name = `shotBuilding${mode}`;
        break;
      case sounds.SHOT_TREE:
        name = `shotTree${mode}`;
        break;
      case sounds.TANK_SINKING:
        name = `tankSinking${mode}`;
        break;
    }

    if (name) {
      (this.soundkit as any)[name]();
    }
  }

  handleResize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;

    // Adjust the body as well, to prevent accidental scrolling on some browsers.
    document.body.style.width = `${window.innerWidth}px`;
    document.body.style.height = `${window.innerHeight}px`;
  }

  handleClick(e: MouseEvent): void {
    e.preventDefault();
    this.world.input.focus();
    if (!this.currentTool) return;

    const [mx, my] = this.mouse;
    const cell = this.getCellAtScreen(mx, my);
    const [action, trees, flexible] = this.world.checkBuildOrder(this.currentTool, cell);
    if (action) {
      this.world.buildOrder(action, trees, cell);
    }
  }

  /**
   * Get the view area in pixel coordinates when looking at the given world coordinates.
   */
  getViewAreaAtWorld(x: number, y: number): [number, number, number, number] {
    const { width, height } = this.canvas;
    let left = mathRound(x / PIXEL_SIZE_WORLD - width / 2);
    left = mathMax(0, mathMin(MAP_SIZE_PIXELS - width, left));
    let top = mathRound(y / PIXEL_SIZE_WORLD - height / 2);
    top = mathMax(0, mathMin(MAP_SIZE_PIXELS - height, top));
    return [left, top, width, height];
  }

  /**
   * Get the map cell at the given screen coordinates.
   */
  getCellAtScreen(x: number, y: number): any {
    const [cameraX, cameraY] = this.lastCenter;
    const [left, top, width, height] = this.getViewAreaAtWorld(cameraX, cameraY);
    return this.world.map.cellAtPixel(left + x, top + y);
  }

  // HUD elements

  /**
   * Draw HUD elements that overlay the map. These are elements that need to be drawn in regular
   * game coordinates, rather than screen coordinates.
   */
  drawOverlay(): void {
    const player = this.world.player;
    if (player && player.armour !== 255) {
      if (player.builder) {
        const b = player.builder.$;
        if (!(b.order === b.states.inTank || b.order === b.states.parachuting)) {
          this.drawBuilderIndicator(b);
        }
      }
      // Only draw reticle if gunsightVisible is true
      if (this.world.gunsightVisible) {
        this.drawReticle();
      }
    }
    this.drawNames();
    this.drawCursor();
  }

  drawReticle(): void {
    const distance = this.world.player.firingRange * TILE_SIZE_PIXELS;
    const rad = (256 - this.world.player.direction) * 2 * mathPI / 256;
    const x = mathRound(this.world.player.x / PIXEL_SIZE_WORLD + mathCos(rad) * distance) - TILE_SIZE_PIXELS / 2;
    const y = mathRound(this.world.player.y / PIXEL_SIZE_WORLD + mathSin(rad) * distance) - TILE_SIZE_PIXELS / 2;
    this.drawTile(17, 4, x, y);
  }

  drawCursor(): void {
    const [mx, my] = this.mouse;
    const cell = this.getCellAtScreen(mx, my);
    this.drawTile(18, 6, cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
  }

  drawNames(): void {
    // Implemented in subclasses
  }

  /**
   * Create the HUD container.
   */
  initHud(): void {
    this.hud = document.createElement('div');
    this.hud.id = 'hud';
    document.body.appendChild(this.hud);
    this.initHudTankStatus();
    this.initHudPillboxes();
    this.initHudBases();
    this.initHudPlayers();
    this.initHudStats();
    this.initHudToolSelect();
    this.initHudNotices();
    this.updateHud();
  }

  initHudTankStatus(): void {
    const container = document.createElement('div');
    container.id = 'tankStatus';
    this.hud!.appendChild(container);

    const deco = document.createElement('div');
    deco.className = 'deco';
    container.appendChild(deco);

    this.tankIndicators = {};
    for (const indicator of ['shells', 'mines', 'armour', 'trees']) {
      const bar = document.createElement('div');
      bar.className = 'gauge';
      bar.id = `tank-${indicator}`;
      container.appendChild(bar);

      const content = document.createElement('div');
      content.className = 'gauge-content';
      bar.appendChild(content);
      this.tankIndicators[indicator] = content;
    }
  }

  /**
   * Create the pillbox status indicator.
   */
  initHudPillboxes(): void {
    const container = document.createElement('div');
    container.id = 'pillStatus';
    this.hud!.appendChild(container);

    const deco = document.createElement('div');
    deco.className = 'deco';
    container.appendChild(deco);

    this.pillIndicators = this.world.map.pills.map((pill: any) => {
      const node = document.createElement('div');
      node.className = 'pill';
      container.appendChild(node);
      return [node, pill];
    });
  }

  /**
   * Create the base status indicator.
   */
  initHudBases(): void {
    const container = document.createElement('div');
    container.id = 'baseStatus';
    this.hud!.appendChild(container);

    const deco = document.createElement('div');
    deco.className = 'deco';
    container.appendChild(deco);

    this.baseIndicators = this.world.map.bases.map((base: any, index: number) => {
      const node = document.createElement('div');
      node.className = 'base';
      // Store the base idx as a data attribute for debugging
      node.setAttribute('data-base-idx', base.idx);
      node.setAttribute('data-array-index', index.toString());
      container.appendChild(node);
      return [node, base];
    });
  }

  /**
   * Create the connected players indicator.
   */
  initHudPlayers(): void {
    const container = document.createElement('div');
    container.id = 'playersStatus';
    this.hud!.appendChild(container);

    const deco = document.createElement('div');
    deco.className = 'deco';
    container.appendChild(deco);

    this.playerIndicators = [];
  }

  /**
   * Create the stats status indicator (kills/deaths).
   */
  initHudStats(): void {
    const container = document.createElement('div');
    container.id = 'statsStatus';
    this.hud!.appendChild(container);

    // First line: Kills (left) and Team Score (right)
    const firstLine = document.createElement('div');
    firstLine.className = 'stat-line';
    container.appendChild(firstLine);

    // Kills (left side)
    const killsGroup = document.createElement('span');
    killsGroup.className = 'stat-group-left';
    firstLine.appendChild(killsGroup);

    const killsIcon = document.createElement('span');
    killsIcon.className = 'stat-icon';
    killsIcon.textContent = '\u2620'; // ☠ skull and crossbones
    killsGroup.appendChild(killsIcon);

    const killsValue = document.createElement('span');
    killsValue.className = 'stat-value';
    killsValue.id = 'stat-kills';
    killsValue.textContent = '0';
    killsGroup.appendChild(killsValue);

    // Team score (right side)
    const scoreGroup = document.createElement('span');
    scoreGroup.className = 'stat-group-right';
    firstLine.appendChild(scoreGroup);

    const scoreIcon = document.createElement('span');
    scoreIcon.className = 'stat-icon';
    scoreIcon.id = 'stat-score-icon';
    scoreIcon.textContent = '\u2605'; // ★ star
    scoreGroup.appendChild(scoreIcon);

    const scoreValue = document.createElement('span');
    scoreValue.className = 'stat-value';
    scoreValue.id = 'stat-score';
    scoreValue.textContent = '0';
    scoreGroup.appendChild(scoreValue);

    // Second line: Deaths
    const deathsLine = document.createElement('div');
    deathsLine.className = 'stat-line';
    container.appendChild(deathsLine);

    const deathsIcon = document.createElement('span');
    deathsIcon.className = 'stat-icon';
    deathsIcon.textContent = '\u2020'; // † dagger
    deathsLine.appendChild(deathsIcon);

    const deathsValue = document.createElement('span');
    deathsValue.className = 'stat-value';
    deathsValue.id = 'stat-deaths';
    deathsValue.textContent = '0';
    deathsLine.appendChild(deathsValue);
  }

  /**
   * Create the build tool selection
   */
  initHudToolSelect(): void {
    this.currentTool = null;
    const tools = document.createElement('div');
    tools.id = 'tool-select';
    this.hud!.appendChild(tools);

    for (const toolType of ['forest', 'road', 'building', 'pillbox', 'mine']) {
      this.initHudTool(tools, toolType);
    }

    // Note: jQuery UI buttonset() functionality would need to be implemented separately
    // or replaced with a modern UI library
  }

  /**
   * Create a single build tool item.
   */
  initHudTool(tools: HTMLDivElement, toolType: string): void {
    const toolname = `tool-${toolType}`;
    const tool = document.createElement('input');
    tool.type = 'radio';
    tool.name = 'tool';
    tool.id = toolname;
    tools.appendChild(tool);

    const label = document.createElement('label');
    label.htmlFor = toolname;
    tools.appendChild(label);

    const span = document.createElement('span');
    span.className = `bolo-tool bolo-${toolname}`;
    label.appendChild(span);

    tool.addEventListener('click', (e) => {
      if (this.currentTool === toolType) {
        this.currentTool = null;
        tools.querySelectorAll('input').forEach((input) => {
          (input as HTMLInputElement).checked = false;
        });
      } else {
        this.currentTool = toolType;
      }
      this.world.input.focus();
    });
  }

  /**
   * Show WIP notice and Github ribbon. These are really a temporary hacks, so FIXME someday.
   */
  initHudNotices(): void {
    if (location.hostname.split('.')[1] === 'github') {
      const notice = document.createElement('div');
      notice.innerHTML = `
        This is a work-in-progress; less than alpha quality!<br>
        To see multiplayer in action, follow instructions on Github.
      `;
      Object.assign(notice.style, {
        position: 'absolute',
        top: '70px',
        left: '0px',
        width: '100%',
        textAlign: 'center',
        fontFamily: 'monospace',
        fontSize: '16px',
        fontWeight: 'bold',
        color: 'white',
      });
      this.hud!.appendChild(notice);
    }

    if (location.hostname.split('.')[1] === 'github' || location.hostname.substr(-6) === '.no.de') {
      const ribbon = document.createElement('a');
      ribbon.href = 'http://github.com/stephank/orona';
      Object.assign(ribbon.style, {
        position: 'absolute',
        top: '0px',
        right: '0px',
      });
      ribbon.innerHTML = '<img src="http://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png" alt="Fork me on GitHub">';
      this.hud!.appendChild(ribbon);
    }
  }

  /**
   * Update the HUD elements.
   */
  updateHud(): void {
    // Pillboxes.
    if (this.pillIndicators) {
      for (let i = 0; i < this.pillIndicators.length; i++) {
        const [node] = this.pillIndicators[i];
        // Always read the current pill from world.map.pills, not the cached reference
        const pill = this.world.map.pills[i];
        if (!pill) continue;

        const statuskey = `${pill.inTank};${pill.carried};${pill.armour};${pill.team};${pill.owner_idx}`;
        // Remove the early continue to always update
        pill.hudStatusKey = statuskey;

        if (pill.inTank || pill.carried) {
          node.setAttribute('status', 'carried');
        } else if (pill.armour === 0) {
          node.setAttribute('status', 'dead');
        } else {
          node.setAttribute('status', 'healthy');
        }
        const color = TEAM_COLORS[pill.team] || { r: 112, g: 112, b: 112 };
        node.style.backgroundColor = `rgb(${color.r},${color.g},${color.b})`;
      }
    }

    // Bases.
    if (this.baseIndicators) {
      for (let i = 0; i < this.baseIndicators.length; i++) {
        const [node] = this.baseIndicators[i];
        // Always read the current base from world.map.bases, not the cached reference
        const base = this.world.map.bases[i];
        if (!base) {
          console.warn(`[HUD] Base at indicator index ${i} is null/undefined`);
          continue;
        }

        const statuskey = `${base.armour};${base.team};${base.owner_idx}`;
        // Remove the early continue to always update
        base.hudStatusKey = statuskey;

        if (base.armour <= 9) {
          node.setAttribute('status', 'vulnerable');
        } else {
          node.setAttribute('status', 'healthy');
        }
        const color = TEAM_COLORS[base.team] || { r: 112, g: 112, b: 112 };
        const newColor = `rgb(${color.r},${color.g},${color.b})`;
        if (node.style.backgroundColor !== newColor) {
          node.style.backgroundColor = newColor;
        }
      }
    }

    // Connected Players.
    if (this.playerIndicators) {
      const container = document.getElementById('playersStatus');
      if (container) {
        // Get all valid tanks (filter out null/undefined)
        const validTanks = this.world.tanks.filter((tank: any) => tank);

        // Remove excess indicators if we have more than the current number of valid tanks
        while (this.playerIndicators.length > validTanks.length) {
          const node = this.playerIndicators.pop();
          if (node) {
            node.remove();
          }
        }

        // Update or create indicators for each valid tank
        for (let i = 0; i < validTanks.length; i++) {
          const tank = validTanks[i];

          // Create indicator if it doesn't exist for this index
          if (!this.playerIndicators[i]) {
            const node = document.createElement('div');
            node.className = 'player';
            container.appendChild(node);
            this.playerIndicators[i] = node;
          }

          const node = this.playerIndicators[i];

          // Update team color
          const color = TEAM_COLORS[tank.team] || { r: 112, g: 112, b: 112 };
          node.style.backgroundColor = `rgb(${color.r},${color.g},${color.b})`;

          // Show X overlay for destroyed tanks
          const isDead = tank.armour === 255;
          if (isDead) {
            node.setAttribute('data-dead', 'true');
          } else {
            node.removeAttribute('data-dead');
          }
        }
      }
    }

    // Tank.
    const p = this.world.player;

    // Stats (kills/deaths/team score).
    if (p && p.kills !== undefined && p.deaths !== undefined) {
      const killsElement = document.getElementById('stat-kills');
      const deathsElement = document.getElementById('stat-deaths');
      const scoreElement = document.getElementById('stat-score');
      const scoreIconElement = document.getElementById('stat-score-icon');

      if (killsElement) {
        killsElement.textContent = p.kills.toString();
      }
      if (deathsElement) {
        deathsElement.textContent = p.deaths.toString();
      }
      if (scoreElement && p.team !== undefined && p.team >= 0 && p.team <= 5) {
        // Calculate team ranking
        const teamScoresWithIndex = this.world.teamScores.map((score: number, index: number) => ({ team: index, score }));
        // Sort by score descending (highest score = 1st place)
        teamScoresWithIndex.sort((a: { team: number; score: number }, b: { team: number; score: number }) => b.score - a.score);

        // Find player's team rank
        const rank = teamScoresWithIndex.findIndex((item: { team: number; score: number }) => item.team === p.team) + 1;

        // Get ordinal suffix
        const getOrdinal = (n: number): string => {
          const s = ['th', 'st', 'nd', 'rd'];
          const v = n % 100;
          return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };

        scoreElement.textContent = getOrdinal(rank);

        // Set star icon color to team color
        if (scoreIconElement) {
          const color = TEAM_COLORS[p.team] || { r: 192, g: 192, b: 240 };
          scoreIconElement.style.color = `rgb(${color.r},${color.g},${color.b})`;
        }
      }
    }
    p.hudLastStatus = p.hudLastStatus || {};
    if (this.tankIndicators) {
      for (const [prop, node] of Object.entries(this.tankIndicators)) {
        const value = p.armour === 255 ? 0 : p[prop];
        if (p.hudLastStatus[prop] === value) continue;
        p.hudLastStatus[prop] = value;

        node.style.height = `${mathRound((value / 40) * 100)}%`;
      }
    }
  }
}

export default BaseRenderer;
