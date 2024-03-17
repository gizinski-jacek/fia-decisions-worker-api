import mongoose from 'mongoose';
import { SeriesDataDocModel } from '../types/myTypes';

const Schema = mongoose.Schema;

const Series_Data_Doc = new Schema<
	Omit<SeriesDataDocModel, 'year'> & { year: Number }
>(
	{
		series: { type: String, trim: true, required: true },
		year: {
			type: Number,
			trim: true,
			min: 2019,
			max: new Date().getFullYear(),
			required: true,
		},
		documents_url: {
			type: String,
			trim: true,
			minlength: 64,
			maxlength: 512,
			required: true,
		},
		manual_upload: { type: Boolean, required: true },
	},
	{ timestamps: true }
);

module.exports = Series_Data_Doc;
