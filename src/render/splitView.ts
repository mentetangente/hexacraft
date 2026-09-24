import * as THREE from 'three';
import type { World } from '../world/World';

// Vista dividida: hexágonos a la izquierda, cuadrados a la derecha. Ambos
// worlds comparten cámara, materiales y texturas; se renderiza cada mitad con
// scissor y una línea fina entre ellas. Los rótulos se ocultan en modo cine.

export class SplitView {
  active = false;
  private readonly separator: HTMLElement;
  private readonly labelHex: HTMLElement;
  private readonly labelSq: HTMLElement;

  constructor(host: HTMLElement) {
    this.separator = document.createElement('div');
    this.separator.style.cssText =
      'position:fixed;top:0;bottom:0;left:50%;width:1px;background:rgba(255,255,255,0.6);pointer-events:none;display:none;';
    host.appendChild(this.separator);

    this.labelHex = document.createElement('div');
    this.labelHex.textContent = 'Hexágonos';
    this.labelHex.style.cssText =
      'position:fixed;top:8px;left:calc(25% - 40px);width:80px;text-align:center;' +
      'font:12px ui-monospace,Consolas,monospace;color:#fff;background:rgba(0,0,0,0.55);' +
      'padding:2px 6px;border-radius:4px;pointer-events:none;display:none;';
    host.appendChild(this.labelHex);

    this.labelSq = document.createElement('div');
    this.labelSq.textContent = 'Cuadrados';
    this.labelSq.style.cssText =
      'position:fixed;top:8px;left:calc(75% - 40px);width:80px;text-align:center;' +
      'font:12px ui-monospace,Consolas,monospace;color:#fff;background:rgba(0,0,0,0.55);' +
      'padding:2px 6px;border-radius:4px;pointer-events:none;display:none;';
    host.appendChild(this.labelSq);
  }

  setActive(on: boolean): void {
    this.active = on;
    const disp = on ? '' : 'none';
    this.separator.style.display = disp;
    this.labelHex.style.display = disp;
    this.labelSq.style.display = disp;
  }

  setCinema(cinema: boolean): void {
    if (!this.active) return;
    const disp = cinema ? 'none' : '';
    this.labelHex.style.display = disp;
    this.labelSq.style.display = disp;
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    worldHex: World,
    worldSq: World,
  ): void {
    const w = renderer.domElement.clientWidth * renderer.getPixelRatio();
    const h = renderer.domElement.clientHeight * renderer.getPixelRatio();
    const halfW = Math.floor(w / 2);

    renderer.autoClear = false;
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);

    // Mitad izquierda: hexágonos.
    worldHex.opaqueGroup.visible = true;
    worldHex.waterGroup.visible = true;
    worldSq.opaqueGroup.visible = false;
    worldSq.waterGroup.visible = false;
    renderer.setScissor(0, 0, halfW, h);
    renderer.setViewport(0, 0, w, h);
    renderer.render(scene, camera);

    // Mitad derecha: cuadrados.
    worldHex.opaqueGroup.visible = false;
    worldHex.waterGroup.visible = false;
    worldSq.opaqueGroup.visible = true;
    worldSq.waterGroup.visible = true;
    renderer.setScissor(halfW, 0, w - halfW, h);
    renderer.setViewport(0, 0, w, h);
    renderer.render(scene, camera);

    renderer.setScissorTest(false);
    renderer.autoClear = true;
  }

  dispose(): void {
    this.separator.remove();
    this.labelHex.remove();
    this.labelSq.remove();
  }
}
