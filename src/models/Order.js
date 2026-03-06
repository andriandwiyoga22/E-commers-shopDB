import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Menghubungkan ke model User
        required: true
    }, orderItem: [{
        name: {
            type: String,
            required: [true, 'Product name is required']
        },
        qty: {
            type: Number,
            required: [true, 'Product quantity is required']
        },
        image: {
            type: String,
            required: [true, 'Product image URL is required']
        },
        price: {
            type: Number,
            required: [true, 'Product price is required']
        }
    }],
}, { timestamps: true });

const Order = mongoose.model('Order', productSchema);

export default Order;