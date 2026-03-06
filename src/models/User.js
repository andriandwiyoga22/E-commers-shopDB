import mongoose from 'mongoose';
import Product from './Product.js';

const userSchema = new mongoose.Schema({
    username:
    {
        type: String,
        unique: true,
        required: [true, 'Username is required']
    },
    password:
    {
        type: String,
        required: [true, 'Password is required']
    },
    role:
    {
        type: String,
        enum: ['seller', 'user'],
        default: 'user'
    },
    money: {
        type: Number,
        default: 0
    }
    , cart: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            qty: { type: Number, default: 1 }
        }
    ], Product: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }]
});

const User = mongoose.model('User', userSchema);

export default User;