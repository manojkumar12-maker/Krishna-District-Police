const mongoose = require('mongoose');

const personnelSchema = new mongoose.Schema({
    name: { type: String, required: true },
    rank: { type: String, required: true },
    genl_no: { type: String, required: true },
    personnel_type: { type: String, required: true },
    district: { type: String, required: true },
    previous_station: { type: String, default: null },
    status: { type: String, default: 'Present' },
    date_of_birth: { type: String, default: null },
    caste: { type: String, default: null },
    education: { type: String, default: null },
    date_of_promotion: { type: String, default: null },
    present_working: { type: String, default: null },
    is_on_deployment: { type: Boolean, default: false },
    deployment_unit: { type: String, default: null },
    date_of_deployment: { type: String, default: null },
    punishments: { type: String, default: null },
    phone_number: { type: String, default: null }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

personnelSchema.set('toJSON', {
    transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});

module.exports = mongoose.model('Personnel', personnelSchema);
