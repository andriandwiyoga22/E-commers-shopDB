import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
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
        required: [true, 'Product price is required'],
        default: 0
    },seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Nama model user kamu
        required: true
    },
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

export default Product;