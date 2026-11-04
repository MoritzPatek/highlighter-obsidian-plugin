import { App, Notice, Platform, PluginSettingTab, Setting } from 'obsidian';
import type ColorHighlighterPlugin from './main';
import {
	DEFAULT_COLORS,
	MAX_NAME_LENGTH,
	findDuplicateSlot,
	splitColor,
	uniqueRgb,
	withHighlightAlpha,
} from './settings';

/** Settings tab: five rows (preview chip, name, opaque color) and a reset button. */
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

		const desc = document.createDocumentFragment();
		desc.append(
			'Shown when you run ',
			createEl('em', { text: 'Color Highlighter: Pick color' }),
			'. Assign Cmd+H in Settings → Hotkeys. Colors are applied at 33% opacity so text stays readable in light and dark themes.',
		);
		new Setting(containerEl).setName('Highlight colors').setDesc(desc).setHeading();

		new Setting(containerEl)
			.setName('Show picker when selecting text')
			.setDesc(
				'Open the color picker as soon as you select text with the mouse. Cmd+H always works.' +
					(Platform.isMobile ? ' Desktop only.' : ''),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoShow).onChange(async (value) => {
					this.plugin.settings.autoShow = value;
					await this.plugin.saveSettings();
				}),
			);

		this.plugin.settings.colors.forEach((entry, index) => {
			const label = `Color ${index + 1}`;
			const setting = new Setting(containerEl).setName(label);
			setting.settingEl.addClass('color-highlighter-setting');

			const chip = setting.controlEl.createSpan({
				cls: 'color-highlighter-chip',
				text: String(index + 1),
				attr: { 'aria-hidden': 'true' },
			});
			chip.style.backgroundColor = entry.color;

			const colorInput = () => setting.controlEl.querySelector('input[type="color"]');
			setting.addText((text) => {
				text.setPlaceholder(label).setValue(entry.name);
				text.inputEl.maxLength = MAX_NAME_LENGTH;
				text.inputEl.setAttribute('aria-label', `Name for color ${index + 1}`);
				text.inputEl.addClass('color-highlighter-name');
				text.onChange(async (value) => {
					entry.name = value.trim() || label;
					colorInput()?.setAttribute('aria-label', `Color for ${entry.name}`);
					await this.plugin.saveSettings();
				});
			});

			setting.addColorPicker((picker) => {
				picker.setValue(splitColor(entry.color).rgb);
				// Live while dragging in the picker: preview and save only. The notes are
				// recolored once, when the picker is released (`change`, below).
				picker.onChange(async (value) => {
					const colors = this.plugin.settings.colors;
					const dup = findDuplicateSlot(colors, index, value);
					const { rgb, nudged } = uniqueRgb(
						value,
						colors.filter((_c, k) => k !== index).map((c) => c.color),
					);
					if (nudged) {
						picker.setValue(rgb);
						new Notice(`Same as ${colors[dup]?.name ?? 'another color'}: shade adjusted slightly.`);
					}
					entry.color = withHighlightAlpha(rgb);
					chip.style.backgroundColor = entry.color;
					await this.plugin.saveSettings();
				});
			});
			colorInput()?.addEventListener('change', () => void this.plugin.commitPalette());
			colorInput()?.setAttribute('aria-label', `Color for ${entry.name}`);
		});

		new Setting(containerEl)
			.setName('Reset colors')
			.setDesc('Restore the five default colors and names.')
			.addButton((button) =>
				button.setButtonText('Reset to defaults').onClick(async () => {
					this.plugin.settings.colors = DEFAULT_COLORS.map((c) => ({ ...c }));
					await this.plugin.saveSettings();
					await this.plugin.commitPalette();
					this.display();
				}),
			);
	}
}
