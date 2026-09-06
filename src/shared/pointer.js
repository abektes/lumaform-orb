import * as THREE from 'three';

export function createPointerTracker(domElement) {
  const pointer = new THREE.Vector2(0, 0);

  function onPointerMove(event) {
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  domElement.addEventListener('pointermove', onPointerMove, { passive: true });

  return {
    pointer,
    dispose() {
      domElement.removeEventListener('pointermove', onPointerMove);
    },
  };
}

export function createClickPulse(domElement, onPulse) {
  function onPointerDown() {
    onPulse();
  }

  domElement.addEventListener('pointerdown', onPointerDown);

  return {
    dispose() {
      domElement.removeEventListener('pointerdown', onPointerDown);
    },
  };
}

export function createDoubleClickHandler(domElement, onDoubleClick) {
  function onDblClick() {
    onDoubleClick();
  }

  domElement.addEventListener('dblclick', onDblClick);

  return {
    dispose() {
      domElement.removeEventListener('dblclick', onDblClick);
    },
  };
}
