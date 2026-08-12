// Minimal Obsidian API mock for testing

export class App {}
export class Plugin {}
export class Modal {
  constructor(public app: App) {}
  open() {}
  close() {}
}
export class Notice {
  constructor(public message: string, public timeout?: number) {}
}
export class Setting {
  constructor(public containerEl: HTMLElement) {}
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addDropdown() { return this; }
  addToggle() { return this; }
  addSlider() { return this; }
  addButton() { return this; }
}
export class PluginSettingTab {
  constructor(public app: App, public plugin: Plugin) {}
}
export class TFile {
  constructor(public path: string, public basename: string) {}
}
export class TFolder {
  constructor(public path: string) {}
}
