import { App, Editor, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
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
	accounts: "start = Equity:Starting Balance\ncash = Assets:Cash\nsavings = Assets:Debit Card\nfood = Expenses:Needs:Food\nrent = Expenses:Needs:Bills\nstreaming = Expenses:Wants:Bills\ncc = Liabilities:Credit Card\nwages = Income:Salary"
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
				this.refreshLedger();
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
		const regex = /^[-*]\s(\d{4}-\d{2}-\d{2}).*(>).*$/gm;

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
			.setDesc("Number of seconds before your vault is scanned and its ledgers processed. (Requires Obsidian reboot)")
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
			.setDesc("The currency that will be used on the ledgers. Can be a symbol (₱) or a code (PHP)")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.currency)
				.setValue(this.plugin.settings.currency)
				.onChange(async (value) => {
					this.plugin.settings.currency = value;
					await this.plugin.saveSettings()
				}));

		new Setting(containerEl)
			.setName("Timezone")
			.setDesc("The timezone to use when processing dates")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.timezone)
				.setValue(this.plugin.settings.timezone)
				.onChange(async (value) => {
					this.plugin.settings.timezone = value;
					await this.plugin.saveSettings()
				}));

		new Setting(containerEl)
			.setName("Account Aliases")
			.setDesc("A list of aliases to use as shorthand for accounts")
			.addTextArea(text => text
				.setValue(this.plugin.settings.accounts)
				.onChange(async (value) => {
					this.plugin.settings.accounts = value;
					await this.plugin.saveSettings()
				}));
	}
}