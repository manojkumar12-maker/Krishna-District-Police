const mongoose = require('mongoose');

const sanctionedStrengthSchema = new mongoose.Schema({
    district: { type: String, required: true },
    personnel_type: { type: String, required: true },
    rank: { type: String, required: true },
    sanctioned_count: { type: Number, default: 0 }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

sanctionedStrengthSchema.index({ district: 1, personnel_type: 1, rank: 1 }, { unique: true });

sanctionedStrengthSchema.set('toJSON', {
    transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});

module.exports = mongoose.model('SanctionedStrength', sanctionedStrengthSchema);
