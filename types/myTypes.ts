export interface TransformedPDFData {
	series: string;
	doc_type: string;
	doc_name: string;
	doc_date: string;
	penalty_type: string;
	grand_prix: string;
	weekend: string;
	incident_title: string;
	document_info: DocumentDetails;
	incident_info: IncidentDetails;
	stewards: string[];
}

export interface DocumentDetails {
	From: string;
	To: string;
	Document: string;
	Date: string;
	Time: string;
}

export interface IncidentDetails {
	Headline: string;
	Driver: string;
	Competitor: string;
	Time: string;
	Session: string;
	Fact: string;
	Offence: string[];
	Decision: string[];
	Reason: string;
}

export interface DecisionOffenceModel extends TransformedPDFData {
	_id: string;
	manual_upload: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface DatabaseNameList {
	[key: string]: string;
}

export interface FiaPageList {
	[key: string]: string;
}

export interface WeekendData {
	date: string;
	raceName: string;
	round: string;
	season: string;
	time: string;
	url: string;
	Circuit: { circuitId: string; circuitName: string; url: string };
	FirstPractice: { date: string; time: string };
	SecondPractice: { date: string; time: string };
	ThirdPractice?: { date: string; time: string };
	Sprint?: { date: string; time: string };
	Qualifying: { date: string; time: string };
}
