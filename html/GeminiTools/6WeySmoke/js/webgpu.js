export class WebGPUContext {
  constructor() {
    this.adapter = null;
    this.device = null;
    this.context = null;
    this.format = null;
    this.validationErrors = 0;
    this.onError = null;
  }

  reportError(source, message) {
    this.validationErrors += 1;
    console.error(`[WebGPU ${source}] ${message}`);
    if (this.onError) {
      this.onError(source, message, this.validationErrors);
    }
  }

  async init(canvas, onError) {
    this.onError = onError;

    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser.');
    }

    this.adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });
    if (!this.adapter) {
      throw new Error('Failed to acquire a WebGPU adapter.');
    }

    this.device = await this.adapter.requestDevice();
    this.device.addEventListener('uncapturederror', (event) => {
      this.reportError('uncaptured', event.error?.message || String(event.error));
    });

    this.context = canvas.getContext('webgpu');
    if (!this.context) {
      throw new Error('Failed to get WebGPU canvas context.');
    }

    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.configureCanvas(canvas);
    return this;
  }

  configureCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque',
    });
  }

  async withValidationScope(label, fn) {
    this.device.pushErrorScope('validation');
    let result;
    try {
      result = await fn();
    } finally {
      const err = await this.device.popErrorScope();
      if (err) {
        this.reportError(label, err.message);
      }
    }
    return result;
  }

  async loadShader(url, label) {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch shader ${url}: ${resp.status}`);
    }
    const code = await resp.text();
    return this.withValidationScope(`shader:${label}`, () => {
      return this.device.createShaderModule({ label, code });
    });
  }
}
