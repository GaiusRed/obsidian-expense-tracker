import costflow from 'costflow';
import { NParseResult, UserConfig } from 'costflow/lib/interface';

interface JournalEntry {
    date: Date;
    payee: string;
    transactions: Transaction[];
    narration: string;
    tags: string[];
    links: string[];
    beancount: string;
}

interface Transaction {
    account: string;
    amount: number;
}

export default class Ledger {
    config: UserConfig;
    journalEntries: JournalEntry[];

    constructor(
        currency: string,
        timezone: string,
        accounts: Record<string, string>) {

        this.config = {
            mode: "beancount",
            indent: 4,
            lineLength: 60,
            currency: currency,
            timezone: timezone,
            account: accounts
        };
        this.flush();
    }

    async parseFiles(lines: string[]) {
        const keys = Object.keys(this.config.account as Record<string, string>);
        lines.forEach(async line => {
            let lineToParse: string = line;
            // Apply Account Aliases
            keys.forEach(key => {
                let regex = new RegExp("\\b" + key + ":", "g")
                lineToParse = lineToParse.replace(regex, (this.config.account as Record<string, string>)[key] + ":")
            });
            // Parse the line
            let result = await costflow.parse(lineToParse, this.config);
            if (this.isTransactionResult(result)) {
                this.add(result as NParseResult.TransactionResult);
            }
        });
    }

    isTransactionResult(obj: NParseResult.Result |
        NParseResult.TransactionResult |
        NParseResult.Error): obj is NParseResult.TransactionResult {
        return (obj as NParseResult.TransactionResult).links !== undefined;
    }

    flush() {
        this.journalEntries = [];
    }

    add(entry: NParseResult.TransactionResult) {
        let journalEntry: JournalEntry = {
            beancount: entry.output as string,
            transactions: [],
            date: new Date(entry.date),
            links: entry.links,
            narration: entry.narration,
            payee: entry.payee,
            tags: entry.tags
        };
        entry.data.forEach((item: any) => {
            journalEntry.transactions.push({
                account: item.account as string,
                amount: item.amount as number
            });
        });
        this.journalEntries.push(journalEntry);
    }

    export(startDate: Date, endDate: Date): string {
        let beancount: string = "";
        this.journalEntries.forEach(entry => {
            if ((entry.date >= startDate) && (entry.date <= endDate)) {
                beancount += entry.beancount + "\n\n";
            }
        });
        return beancount;
    }
}