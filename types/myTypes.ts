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
	pdf_original_url: string;
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
	Infringement: string[];
	Decision: string[];
	Reason: string;
}

export interface PenaltyModel extends TransformedPDFData {
	_id: string;
	manual_upload: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface SeriesData {
	series: string;
	year: number;
	documents_url: string;
}

export interface SeriesDataDocModel extends SeriesData {
	_id: string;
	manual_upload: boolean;
	createdAt: string;
	updatedAt: string;
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
