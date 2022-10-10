//@ts-nocheck

import mongoose, { MongooseOptions } from 'mongoose';
import { dbNameList } from '../myData/myData';

const MONGODB_URI =
	process.env.NODE_ENV === 'production'
		? process.env.MONGODB_URI
		: process.env.MONGODB_URI_DEV;

if (!MONGODB_URI) {
	throw new Error(
		'Please define the MONGODB_URI / MONGODB_URI_DEV environment variable inside .env.local'
	);
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
	cached = global.mongoose = { client: null };
}

const connectMongo = async (dbName: string) => {
	const opts: MongooseOptions = {
		bufferCommands: true,
	};

	if (!cached.client) {
		const client = await mongoose.connect(
			MONGODB_URI + dbName + '?retryWrites=true&w=majority',
			opts
		);
		if (dbName === dbNameList.other_documents_db) {
			if (!client.models.Missing_Data_Doc) {
				client.model('Missing_Data_Doc', require('../models/missingDoc'));
			}
			if (!client.models.Contact_Doc) {
				client.model('Contact_Doc', require('../models/contactDoc'));
			}
			if (!client.models.Decision_Offence) {
				client.model('Decision_Offence', require('../models/decisionOffence'));
			}
		} else {
			if (!client.models.Decision_Offence) {
				client.model('Decision_Offence', require('../models/decisionOffence'));
			}
		}

		cached.client = client;
		return cached.client.connections[0];
	}

	const conn = cached.client.connections.find((conn) => conn.name === dbName);
	if (!conn) {
		const conn = cached.client.createConnection(
			MONGODB_URI + dbName + '?retryWrites=true&w=majority',
			opts
		);
		if (dbName === dbNameList.other_documents_db) {
			if (!conn.models.Missing_Data_Doc) {
				conn.model('Missing_Data_Doc', require('../models/missingDoc'));
			}
			if (!conn.models.Contact_Doc) {
				conn.model('Contact_Doc', require('../models/contactDoc'));
			}
			if (!conn.models.Decision_Offence) {
				conn.model('Decision_Offence', require('../models/decisionOffence'));
			}
		} else {
			if (!conn.models.Decision_Offence) {
				conn.model('Decision_Offence', require('../models/decisionOffence'));
			}
		}
		return conn;
	}
	return conn;
};

export default connectMongo;
