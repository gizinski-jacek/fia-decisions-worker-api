const { PdfReader } = require('pdfreader');

// Parsing PDF buffer data and returning document strings in array.
export const readPDFPages = (buffer: Buffer): Promise<string[]> => {
	const reader = new PdfReader();
	return new Promise((resolve, reject) => {
		const stringsArray: string[] = [];
		reader.parseBuffer(buffer, (err: any, item: any) => {
			if (err) {
				reject(err);
			} else if (!item) {
				resolve(stringsArray);
			} else if (item.text) {
				stringsArray.push(item.text.normalize('NFKD'));
			}
		});
	});
};
