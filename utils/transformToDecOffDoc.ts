import {
	DocumentDetails,
	IncidentDetails,
	TransformedPDFData,
} from '../types/myTypes';

const getCleanFilename = (string: string): string => {
	let filename = string;
	// Checking if string value comes from file name or from anchors href.
	if (string.lastIndexOf('/') === -1) {
		// Removing file extension.
		filename = string.slice(0, -4);
	} else {
		// Extracting file name from href, removing extension.
		filename = string.slice(string.lastIndexOf('/') + 1).slice(0, -4);
	}
	// Matching against common duplicate file suffixes and removing them.
	// Replacing underscores and trimming.
	const cleanedUp = filename
		.replace(/(_|-){1}0$/im, '')
		.replace(/(_|-){1}?\(\d{1,}\)$/im, '')
		.replaceAll('_', ' ')
		.toLowerCase()
		.trim();
	return cleanedUp;
};

// Checking for edge case where document might be marked as Decision or Offence
// but still has different format than the one allowed.
const checkForRequiredFields = (data: string[]): boolean => {
	const requiredFields = [
		'competitor',
		'time',
		'fact',
		'offence',
		'decision',
		'reason',
	];
	const fieldsExist = requiredFields.map((word) =>
		data.some((string) => string.toLowerCase().includes(word))
	);
	return fieldsExist.every((v) => v);
};

// Checking if document file name is titled Offence or Decision.
const getDocumentType = (filename: string, gpName: string): string => {
	const str = filename.replace(gpName, '').toLowerCase().trim().slice(0, 12);
	return str.includes('offence')
		? 'offence'
		: str.includes('decision')
		? 'decision'
		: 'wrong doc type';
};

const getIncidentTitle = (filename: string, gpname: string): string => {
	// Removing grand prix name from filename string.
	let str = filename.replace(gpname, '').toLowerCase().trim();
	// Checking for a dash, removing it and trimming whitespaces.
	if (str.charAt(0) === '-') {
		str = str.slice(1).trim();
	}
	// Checking for "f1", "f2", "f3", "offence" and "decision" word, removing it and trimming whitespaces.
	if (
		str
			.slice(0, 12)
			.trim()
			.match(/(offence|decision){1}/im)
	) {
		str = str.replace(/(f(1|2|3)\s)?(offence|decision){1}/im, '').trim();
	}
	// Checking for a dash, removing it and trimming whitespaces.
	if (str.charAt(0) === '-') {
		str = str.slice(1).trim();
	}
	// Checking for extra dot after removing suffixes.
	if (str.charAt(str.length - 1) === '.') {
		str = str.slice(0, str.length - 1).trim();
	}
	return str;
};

const splitPDFData = (
	pdfData: string[]
): {
	documentStrings: string[];
	incidentStrings: string[];
	headlineStrings: string[];
	reasonAndStewardsStrings: string[];
	weekendDate: string;
} => {
	const data = pdfData.map((str) => str.trim());
	// Extracting general document data fields, like "From", "To", "Document #", "Date" and "Time".
	const fromToFields = data.slice(data.indexOf('From'), data.indexOf('To') + 3);
	// "To" whom field is a two line text separated by comma, joining them.
	const toWhomRecipient =
		fromToFields[fromToFields.length - 2] +
		' ' +
		fromToFields[fromToFields.length - 1];
	const documentInfoFixed = fromToFields
		.map((str, i) => {
			if (i === 3 && fromToFields[i + 1]) {
				return str + ' ' + fromToFields[i + 1];
			}
			if (i === 4) {
				return;
			}
			return str;
		})
		.filter((u) => u !== undefined) as string[];
	const docDateTimeFields = data.slice(
		data.indexOf('Document'),
		data.indexOf('Time') + 2
	);
	const documentStrings = documentInfoFixed.concat(docDateTimeFields);

	// Extracting incident details fields, like opening statement, "No / Driver",
	// "Competitor", incident "Time", "Session", "Fact", "Offence" and "Decision".
	const incidentStrings = data.slice(
		data.indexOf('Competitor') - 2,
		data.lastIndexOf('Reason')
	);
	const incidentStringsFormatted = cleanupIncidentDetails(incidentStrings);

	// Extracting headline strings.
	const headlineFirstLine = data.find(
		(str) => str.length > 12 && str.toLowerCase().includes('the stewards')
	);
	if (!headlineFirstLine) throw new Error('Headline extraction error.');
	const headlineStartIndex = data.indexOf(headlineFirstLine);

	const headlineStrings = data.slice(
		headlineStartIndex,
		data.indexOf('Competitor') - 2
	);

	const reasonAndStewardsStrings = data
		.slice(data.lastIndexOf('Reason') + 1)
		.filter((str) => str !== 'The Stewards');

	const weekendDate = getWeekendDate(data, headlineStartIndex);

	return {
		documentStrings,
		incidentStrings: incidentStringsFormatted,
		headlineStrings,
		reasonAndStewardsStrings,
		weekendDate,
	};
};

// Replacing "No / Driver" field with "Driver" so it gets properly cast
// as key in schema model. Skipping document if "Team Manager" is present
// instead of "No / Driver", as we're not interested in non-driver penalties.
const cleanupIncidentDetails = (data: string[]): string[] => {
	const formatted = data
		.map((str, i, arr) => {
			if (str.match(/no.\/.driver/im)) {
				return 'Driver';
			} else if (
				i + 1 !== arr.length &&
				str.toLowerCase().trim() === 'team' &&
				arr[i + 1].toLowerCase().trim() === 'manager'
			) {
				console.log('Not a driver penalty. Skipping.');
				throw new Error('Not a driver penalty. Skipping.');
			} else if (str === 'The Stewards') {
				return;
			} else {
				return str;
			}
		})
		.filter((u) => u !== undefined) as string[];
	return formatted;
};

const getWeekendDate = (data: string[], headlineIndex: number): string => {
	// Extracting first index, which is race weekend date, and removing it from array.
	let weekend: string = '';

	// Removing known, easy to find fields.
	// Filtering out instances of extra "The Stewards" strings and
	// strings shorter than 4 characters, those are each letter of Grand Prix name.
	// Skipping first index which might contain the year, and slicing until start of headline.
	const removedKnownFields = data;
	removedKnownFields.splice(headlineIndex);
	removedKnownFields.splice(data.indexOf('From'), 5);
	removedKnownFields.splice(data.indexOf('Document'), 6);
	const removedMisc = removedKnownFields
		.filter((str) => str !== 'The Stewards')
		.filter((str) => str.length > 4)
		.slice(1);

	// Checking for edge case where date might be split into two strings.
	if ((removedMisc[0] as string).length < 12) {
		weekend = ((removedMisc[0] as string).trim() +
			' ' +
			removedMisc[1]) as string;
	} else {
		weekend = removedMisc[0] as string;
	}
	return weekend;
};

// The array should now only contain detailed incident data strings.
// Strings after Fact and before Offence describe facts about incident,
// they can be single line or several lines long, or a list of changed
// car components indicated by colon. In case of the former they get joined,
// in latter case they get returned as is. In both cases the returned value
// is an array of string, containing just one long string or list of strings.
// Using SkipIndexes array to skip indexes of string that are part of longer
// sentence / paragraph and were joined with previous string.
// Similar reasoning and method is used for strings between "Decision" and end of array.
// Joining string between "Offence" and "Decision" fields.
const splitIncidentStrings = (
	data: string[]
): (string | string[] | undefined)[] => {
	const incidentSkipIndexes: number[] = [];
	const splitData = data
		.map((str, index) => {
			if (incidentSkipIndexes.indexOf(index) !== -1) {
				return;
			}

			if (data[index - 1] === 'Fact') {
				const arr: string[] = [];
				let i = index;
				if (i === index && data[i]?.charAt(data[i].length - 1) !== ':') {
					while (data[i] !== 'Offence') {
						arr.push(data[i] as string);
						incidentSkipIndexes.push(i);
						i++;
					}
					return arr.join(' ');
				} else {
					while (data[i] !== 'Offence') {
						if ((data[i + 1] as string).length < 6) {
							arr.push(data[i] + ' ' + data[i + 1]);
							incidentSkipIndexes.push(i, i + 1);
						} else {
							arr.push(data[i] as string);
							incidentSkipIndexes.push(i);
						}
						i++;
					}
					return arr;
				}
			}

			if (data[index - 1] === 'Offence') {
				const arr: string[] = [];
				let i = index;
				while (data[i] !== 'Decision') {
					arr.push(data[i] as string);
					incidentSkipIndexes.push(i);
					i++;
				}
				return arr.join(' ');
			}

			if (data[index - 1] === 'Decision') {
				const arr: string[] = [];
				let i = index;
				if (data[i]?.charAt(data[i]?.length - 1) === ':') {
					while (data[i]) {
						arr.push(data[i] as string);
						incidentSkipIndexes.push(i);
						i++;
					}
					return arr;
				} else {
					while (data[i]) {
						arr.push(data[i] as string);
						incidentSkipIndexes.push(i);
						i++;
					}
					return [arr.join(' ')];
				}
			}

			return str;
		})
		.filter((u) => u !== undefined);

	return splitData;
};

const formatDocumentDetails = (data: string[]): DocumentDetails => {
	const documentDetails = {} as DocumentDetails;
	// Transforming general document data strings into key, value pairs.
	for (let i = 0; i < data.length; i += 2) {
		const key = data[i] as keyof DocumentDetails;
		const value = data[i + 1];
		documentDetails[key] = value || '';
	}
	return documentDetails;
};

const formatIncidentDetails = (
	data: string[],
	headlineStrings: string[]
): IncidentDetails => {
	const formatted = {} as IncidentDetails;
	formatted.Headline = headlineStrings.join(' ');

	const splitData = splitIncidentStrings(data);

	// Transforming incident details strings into key-value pairs.
	for (let i = 0; i < splitData.length; i += 2) {
		// Reminder to fix type error here
		const key = splitData[i];
		const value = splitData[i + 1] || '';
		// TS check disabled for next line until I find a way to reconcile the
		// problem of "key: string | string[] cannot be used as keyof IncidentInfo".
		// @ts-ignore
		formatted[key] = value;
	}
	return formatted;
};

const getPenaltyType = (data: IncidentDetails): string => {
	// List of applicable penalties to check against in order of most to least severe.
	const penaltyTypeList = [
		'disqualified',
		'drive through',
		'drive-through',
		'pit lane',
		'pit-lane',
		'grid',
		'drop of one position',
		'stop and go',
		'stop & go',
		'time',
		'seconds',
		'fine',
		'warning',
		'reprimand',
	];
	let penalty = 'no penalty';
	// Checking for penalty type in first string of Decision array.
	// Exiting on first penalty found to prevent overwriting with lesser penalty.
	// If not found it is assumed no penalty was applied.
	for (let i = 0; i < penaltyTypeList.length; i++) {
		if (data.Decision[0].toLowerCase().includes(penaltyTypeList[i])) {
			if (penaltyTypeList[i] === 'drop of one position') {
				penalty = 'grid';
				break;
			}
			if (penaltyTypeList[i] === 'stop & go') {
				penalty = 'stop and go';
				break;
			}
			if (penaltyTypeList[i] === 'seconds') {
				penalty = 'time';
				break;
			}
			penalty = penaltyTypeList[i];
			break;
		}
	}
	return penalty;
};

const formatDate = (data: DocumentDetails): string => {
	// Joining "Date" and "Time", creating Date object, extracting
	// year, month, day, hour and minute, joining them into string
	// which will be a valid Date format if used to create new Date object.
	const dateString = data.Date + ' ' + data.Time;
	const date = new Date(dateString);
	const day = date.toLocaleString([], { day: '2-digit' });
	const month = date.toLocaleString([], { month: '2-digit' });
	const year = date.toLocaleString([], { year: 'numeric' });
	// Forcing 24 hour format.
	const hour = date.toLocaleString('en-GB', { hour: '2-digit' });
	const minute = date.toLocaleString([], { minute: '2-digit' });
	return year + '/' + month + '/' + day + ' ' + hour + ':' + minute;
};

export const createDecOffDocument = (
	// Value from anchor href property to decompose into file name, doc type and grand prix name.
	href: string,
	// Array of strings parsed from FIA Decision or Offence documents.
	pdfDataArray: string[],
	// Info to determine number of strings to slice off, F1 has 4 stewards, F2 and F3 has 3 stewards.
	series: 'f1' | 'f2' | 'f3'
): TransformedPDFData => {
	const filename = getCleanFilename(href);

	// Check if file has accepted format.
	const fileIsValid = checkForRequiredFields(pdfDataArray);
	if (!fileIsValid) {
		console.log(`Incorrect document format: ${filename}`);
		throw new Error('Incorrect document format.');
	}

	// Extracting grand prix name.
	const grandPrixName = filename.slice(0, filename.indexOf('-')).trim();

	const docType = getDocumentType(filename, grandPrixName);
	const incidentTitle = getIncidentTitle(filename, grandPrixName);

	// Splitting pdf data strings into sections.
	const {
		documentStrings,
		incidentStrings,
		headlineStrings,
		reasonAndStewardsStrings,
		weekendDate,
	} = splitPDFData(pdfDataArray);

	const documentDetails = formatDocumentDetails(documentStrings);

	const incidentDetails = formatIncidentDetails(
		incidentStrings,
		headlineStrings
	);

	// Checking which series we are working on to know how many strings to
	// skip at the end of array, F1 has one steward more than F2 and F3.
	const stewardCount = series === 'f1' ? 4 : 3;
	// Extracting stewards names from the end of document.
	const stewards = reasonAndStewardsStrings.slice(-stewardCount);

	// Skipping stewards names from the end of array to extract "Reason"
	// strings after it and joining them into single paragraph.
	const reasonContents = reasonAndStewardsStrings
		.slice(0, stewardCount - stewardCount * 2)
		.join(' ');

	const penaltyType = getPenaltyType(incidentDetails);
	const docDate = formatDate(documentDetails);
	// Returning transformed strings as single formatted data object.
	// If "Session" field is not present defaulting it to "N/A" value.
	const document: TransformedPDFData = {
		series: series,
		doc_type: docType,
		doc_name: filename,
		doc_date: docDate,
		grand_prix: grandPrixName,
		penalty_type: penaltyType,
		weekend: weekendDate,
		incident_title: incidentTitle,
		document_info: documentDetails,
		incident_info: {
			...incidentDetails,
			Session: incidentDetails.Session || 'N/A',
			Reason: reasonContents,
		},
		stewards: stewards,
	};
	return document;
};
