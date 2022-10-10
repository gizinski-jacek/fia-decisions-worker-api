import { DatabaseNameList, FiaPageList } from '../types/myTypes';

// Main FIA domain.
export const fiaDomain: string = 'https://www.fia.com';

// FIA page for supported racing series.
export const fiaPageList: FiaPageList = {
	f1_2022_page:
		'https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2022-2005',
	f1_2021_page:
		'https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2021-1108',
	f1_2020_page:
		'https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2020-1059',
	f1_2019_page:
		'https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2019-971',
	f2_2022_page:
		'https://www.fia.com/documents/championships/formula-2-championship-44/season/season-2022-2005',
	f2_2021_page:
		'https://www.fia.com/documents/championships/formula-2-championship-44/season/season-2021-1108',
	f3_2022_page:
		'https://www.fia.com/documents/championships/fia-formula-3-championship-1012/season/season-2022-2005',
	f3_2021_page:
		'https://www.fia.com/documents/championships/fia-formula-3-championship-1012/season/season-2021-1108',
};

export const supportedSeries: string[] = ['f1', 'f2', 'f3'];

// Database names for each supported racing series.
export const dbNameList: DatabaseNameList = {
	f1_2022_db: '2022_F1_WC_Docs',
	f1_2021_db: '2021_F1_WC_Docs',
	f1_2020_db: '2020_F1_WC_Docs',
	f1_2019_db: '2019_F1_WC_Docs',
	f2_2022_db: '2022_F2_WC_Docs',
	f2_2021_db: '2021_F2_WC_Docs',
	f3_2022_db: '2022_F3_WC_Docs',
	f3_2021_db: '2021_F3_WC_Docs',
	other_documents_db: 'Other_Docs',
};

export const disallowedWordsInDocName = [
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
];
