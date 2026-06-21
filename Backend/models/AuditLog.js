const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        enum: ['CREATE', 'UPDATE', 'DELETE', 'CLEAR_ALL', 'IMPORT', 'UPDATE_SANCTIONED', 'UPDATE_DEPUTATION']
    },
    performedBy: { type: String, required: true },
    targetId: { type: String, required: true },
    targetType: { type: String, required: true },
    changes: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now }
});

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ performedBy: 1 });

auditLogSchema.set('toJSON', {
    transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
    }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
