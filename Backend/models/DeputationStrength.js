const mongoose = require('mongoose');

const deputationStrengthSchema = new mongoose.Schema({
    unit_name: { type: String, required: true },
    rank: { type: String, required: true },
    sanctioned_count: { type: Number, default: 0 }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

deputationStrengthSchema.index({ unit_name: 1, rank: 1 }, { unique: true });

deputationStrengthSchema.set('toJSON', {
    transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});

module.exports = mongoose.model('DeputationStrength', deputationStrengthSchema);
