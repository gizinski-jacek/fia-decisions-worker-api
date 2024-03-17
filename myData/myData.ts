// Main FIA domain.
export const fiaDomain: string = 'https://www.fia.com';

// List of supported Formula series.
export const supportedSeries: string[] = ['f1', 'f2', 'f3'];

// Page with penalties documents for each series (no specific year).
export const seriesDocumentsPage: { [key: string]: string } = {
	f1: 'https://www.fia.com/documents/championships/championships/fia-formula-one-world-championship-14',
	f2: 'https://www.fia.com/documents/championships/championships/formula-2-championship-44',
	f3: 'https://www.fia.com/documents/championships/championships/fia-formula-3-championship-1012',
};

export const disallowedWordsInDocName: string[] = [
	'reprimand',
	'withdrawal',
	'schedule',
	'set a time',
	'permission to start',
	'protest lodged',
	'protest',
	'cover',
	'alledgedly score',
	'right of review',
	'petition to review',
	'summons',
];
