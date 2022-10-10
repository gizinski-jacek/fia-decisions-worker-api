import { Stream } from 'stream';

// Transforming PDF file stream data to buffer data for use with PdfReader.
export const streamToBuffer = async (stream: Stream): Promise<Buffer> => {
	return new Promise<Buffer>((resolve, reject) => {
		const buffer = Array<any>();
		stream.on('data', (chunk) => buffer.push(chunk));
		stream.on('end', () => resolve(Buffer.concat(buffer)));
		stream.on('error', (err) => reject(`Error converting stream - ${err}`));
	});
};
