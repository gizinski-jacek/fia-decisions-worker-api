import { Mongoose } from 'mongoose';

declare global {
	var mongoose: { client: Mongoose | null };
}
