import { App, Editor, Modal, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import Ledger from 'ledger';

interface ExpenseTrackerSettings {
	ledgerFolder: string;
	refreshInterval: number;
	currency: string;
	timezone: string;
	accounts: string;
}

const DEFAULT_SETTINGS: ExpenseTrackerSettings = {
	ledgerFolder: '',
	refreshInterval: 15,
	currency: "PHP",
	timezone: "Asia/Manila",
	accounts: "start = Equity:Starting Balance\na = Assets\nl = Liabilities\nx = Expenses\ni = Income\nw = Expenses:Wants\nn = Expenses:Needs"
}

export default class ExpenseTracker extends Plugin {
	settings: ExpenseTrackerSettings;
	ledger: Ledger;

	async onload() {
		await this.loadSettings();
		this.ledger = new Ledger(
			this.settings.currency,
			this.settings.timezone,
			this.parseStrToRecord(this.settings.accounts)
		);

		this.addCommand({
			id: 'refresh-ledger',
			name: 'Manually Refresh the Ledger',
			callback: async () => {
				await this.refreshLedger();
			}
		});

		this.addCommand({
			id: 'export-ledger',
			name: 'Export the Ledger to Current File',
			editorCallback: async (editor: Editor) => {
				await this.refreshLedger();
				new ExportModal(this.app, (startDate: Date, endDate: Date) => {
					editor.replaceRange(this.ledger.export(startDate, endDate), editor.getCursor());
				}).open();
			}
		});

		this.addSettingTab(new ExpenseTrackerSettingsTab(this.app, this));

		this.registerInterval(window.setInterval(
			() => this.refreshLedger(),
			this.settings.refreshInterval * 1000));
	}

	onunload() {
		this.ledger.flush();
	}

	async refreshLedger() {
		const { vault } = this.app;
		let filteredFiles: TFile[] = [];
		vault.getMarkdownFiles().forEach(file => {
			if (file.path.startsWith(this.settings.ledgerFolder)) {
				filteredFiles.push(file);
			}
		});
		const fileContents: string[] = await Promise.all(
			filteredFiles.map((file) => vault.cachedRead(file))
		);
		this.ledger.flush();
		fileContents.forEach((content) => {
			this.ledger.parseFiles(this.filterMarkdown(content));
		});
		console.log(this.ledger.journalEntries);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	parseStrToRecord(input: string): Record<string, string> {
		const lines = input.split("\n"); // Split the input on newline characters to get an array of lines
		const record: Record<string, string> = {}; // Initialize an empty object

		lines.forEach(line => { // Process each line
			const [key, value] = line.split(" = "); // Split the line on " = " to get the key and value
			record[key] = value; // Assign the value to the corresponding key in the object
		});

		return record; // Return the resulting object
	}

	filterMarkdown(markdown: string): string[] {
		// Declare regex matching markdown list item starting with date, followed by the > symbol somewhere afterwards
		const regex = /^\s*[-*]\s(\d{4}-\d{2}-\d{2}).*(>).*$/gm;

		// Split markdown content into lines
		const lines = markdown.split('\n');

		// Filter lines based on regex
		let filteredLines: string[] = [];
		lines.filter(line => {
			const matchValue = !!line.match(regex);
			// If there is a match, remove the first "-", then trim whitespace
			if (matchValue) {
				filteredLines.push(line.trim().replace(/^-/, "").trim());
			}
		});

		return filteredLines;
	}
}

class ExportModal extends Modal {
	startDate: Date;
	endDate: Date;
	onSubmit: (startDate: Date, endDate: Date) => void;

	constructor(app: App, onSubmit: (startDate: Date, endDate: Date) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h1", { text: "Export Ledger entries between which dates?" });

		new Setting(contentEl)
			.setName("Start Date")
			.addMomentFormat((el) => {
				el.setDefaultFormat("YYYY-MM-DD")
				el.onChange((value) => {
					this.startDate = new Date(value);
				})
			});

		new Setting(contentEl)
			.setName("End Date")
			.addMomentFormat((el) => {
				el.setDefaultFormat("YYYY-MM-DD")
				el.onChange((value) => {
					this.endDate = new Date(value);
				})
			});

		new Setting(contentEl)
			.addButton((btn) => btn
				.setButtonText("Submit")
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(this.startDate, this.endDate);
				}));
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}

class ExpenseTrackerSettingsTab extends PluginSettingTab {
	plugin: ExpenseTracker;

	constructor(app: App, plugin: ExpenseTracker) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Ledger Folder")
			.setDesc("A folder in your vault that contains the ledgers that will be processed")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.ledgerFolder)
				.setValue(this.plugin.settings.ledgerFolder)
				.onChange(async (value) => {
					this.plugin.settings.ledgerFolder = value;
					await this.plugin.saveSettings()
				}));

		new Setting(containerEl)
			.setName("Refresh Interval")
			.setDesc("Number of seconds before your vault is scanned and its ledgers processed.")
			.addSlider(slider => slider
				.setDynamicTooltip()
				.setLimits(3, 30, 1)
				.setValue(this.plugin.settings.refreshInterval)
				.onChange(async (value) => {
					this.plugin.settings.refreshInterval = value;
					await this.plugin.saveSettings()
				}));

		new Setting(containerEl)
			.setName("Currency")
			.setDesc("The currency code that will be used on the ledgers. Must be in ISO 4217 format (PHP, USD, etc)")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.currency)
				.setValue(this.plugin.settings.currency)
				.onChange(async (value) => {
					this.plugin.settings.currency = value;
					await this.plugin.saveSettings()
				}));

		new Setting(containerEl)
			.setName("Timezone")
			.setDesc("The timezone to use when processing dates. Must be in IANA format (Asia/Manila, America/New_York, etc.)")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.timezone)
				.setValue(this.plugin.settings.timezone)
				.onChange(async (value) => {
					this.plugin.settings.timezone = value;
					await this.plugin.saveSettings()
				}));

		new Setting(containerEl)
			.setName("Account Aliases")
			.setDesc("A list of aliases to use as shorthand for accounts. Note: This is case sensitive.")
			.addTextArea(text => text
				.setValue(this.plugin.settings.accounts)
				.onChange(async (value) => {
					this.plugin.settings.accounts = value;
					await this.plugin.saveSettings()
				}));

		containerEl
			.createEl("p", { text: "In personal accounting, it's important to separate acconts into at least four categories: ASSETS to represent what you own, LIABILITIES to represent what you owe to others, INCOME which represents money that comes to your possession (like salary/wages) and EXPENSES which represents money you pay to others." });
		containerEl
			.createEl("p", { text: "This plugin's default Account Aliases represent these categories, along with two others that are useful to track: splitting EXPENSES to Wants and Needs. Of course, these are just suggestions, and feel free to customize your ledger as you see fit. Good luck!" });
	}
}