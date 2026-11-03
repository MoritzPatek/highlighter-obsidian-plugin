import { App, PluginSettingTab, Setting } from 'obsidian';
import type ColorHighlighterPlugin from './main';
import { DEFAULT_COLORS, joinColor, splitColor } from './settings';

/** Basic settings tab. To be polished to the design later. */
export class ColorHighlighterSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ColorHighlighterPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('p', {
			text: 'Name, color and opacity of each highlight. Renamed colors appear in the command list after you reload Obsidian.',
			cls: 'setting-item-description',
		});

		this.plugin.settings.colors.forEach((entry, index) => {
			const { rgb, alpha } = splitColor(entry.color);
			let currentRgb = rgb;
			let currentAlpha = alpha;
			const save = async () => {
				entry.color = joinColor(currentRgb, currentAlpha);
				await this.plugin.saveSettings();
			};

			new Setting(containerEl)
				.setName(`Color ${index + 1}`)
				.addText((text) =>
					text.setValue(entry.name).onChange(async (value) => {
						const name = value.trim();
						if (name === '') return;
						entry.name = name;
						await this.plugin.saveSettings();
					}),
				)
				.addColorPicker((picker) =>
					picker.setValue(rgb).onChange(async (value) => {
						currentRgb = value;
						await save();
					}),
				)
				.addSlider((slider) =>
					slider
						.setLimits(10, 100, 1)
						.setValue(Math.round(alpha * 100))
						.setDynamicTooltip()
						.onChange(async (value) => {
							currentAlpha = value / 100;
							await save();
						}),
				);
		});

		new Setting(containerEl)
			.setName('Reset colors')
			.setDesc('Restore the default names and colors.')
			.addButton((button) =>
				button.setButtonText('Reset').onClick(async () => {
					this.plugin.settings.colors = DEFAULT_COLORS.map((c) => ({ ...c }));
					await this.plugin.saveSettings();
					this.display();
				}),
			);
	}
}
