import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import User from './src/models/User.js';
import Product from './src/models/Product.js';
import Order from './src/models/Order.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';

const app = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI).then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.error('Error connecting to MongoDB:', err);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', './src/views');
app.use(cookieParser());
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
}); // tidak bisa back ke halaman sebelumnya setelah logout

// Middleware for JWT Authentication
const auth = (req, res, next) => {
    const token = req.cookies.token
    if (!token) return res.status(401).redirect('/login');

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).redirect('/login');
        req.user = user;
        next();
    });
};

const guest = (req, res, next) => {
    const token = req.cookies.token
    if (token) {
        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (!err) return res.status(403).redirect('/dashboard');
            next();
        });
    } else {
        next();
    }
};

const alwaysNext = (req, res, next) => {
    const token = req.cookies.token;
    if (token) {
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (!err) req.user = decoded;
            next();
        });
    } else {
        next();
    }
};

// Routes Render Pages Ejs
app.get('/', alwaysNext, async (req, res) => {
    const products = await Product.find().populate('seller', 'username');
    const user = req.user ? await User.findById(req.user.id) : null;

    res.render('index', { user, products });
})
app.get('/login', guest, (req, res) => {
    res.render('login');
})
app.get('/register', guest, (req, res) => {
    res.render('register');
})
app.get('/dashboard', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    res.render('dashboard', { user });
});
app.get('/topup', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    res.render('topup', { user });
});
app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});
app.get('/products', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (user.role !== 'seller') {
        return res.status(403).redirect('/dashboard');
    }
    // Hanya menampilkan produk milik penjual yang sedang login
    const products = await Product.find({ seller: req.user.id }).populate('seller', 'username');

    res.render('products', { products, user });
});
app.get('/products/newProduct', auth, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (user.role === 'seller') {
        return res.render('newProduct', { user });
    }
    res.status(403).redirect('/dashboard');
});
app.get('/products/detailProduct/:id', auth, async (req, res) => {
    const { id } = req.params;
    const product = await Product.findById(id).populate('seller', 'username');
    if (!product) return res.status(404).send('Product not found');
    res.render(`detailProduct`, { product });
});
app.get('/shoppingCart', auth, async (req, res) => {
    const user = await User.findById(req.user.id).populate('cart.productId');
    res.render('shoppingCart', { user });
});

// Controllers for Register and Login
app.post('/register', async (req, res) => {
    const existingUser = await User.findOne({ username: req.body.username });
    if (existingUser) {
        return res.status(400).send('Username already exists');
    }
    const { username, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.status(201).redirect('/login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (user && await bcrypt.compare(password, user.password)) {

        const token = jwt.sign({ id: user._id, username: user.username },
            'secretkey', { expiresIn: '2h' });

        res.cookie('token', token,
            { httpOnly: true }, { maxAge: 2 * 60 * 60 * 1000 });

        res.status(200).redirect('/');

    } else {
        res.status(401).redirect('/login');
    }
});

app.post('/dashboard', auth, async (req, res) => {
    const { role } = req.body;
    await User.findByIdAndUpdate(req.user.id, { role });
    res.status(200).redirect('/dashboard');
});


// Controllers for Products
app.post('/products', auth, async (req, res) => {
    const { name, qty, image, price } = req.body;
    const newProduct = new Product({ name, qty, image, price, seller: req.user.id });
    await newProduct.save();
    res.status(201).redirect('/products');
});

app.post('/products/:id/delete', auth, async (req, res) => {
    const { id } = req.params;
    // Validasi yang bisa menghapus hanya penjual yang membuat produk
    const product = await Product.findById(id);
    if (!product) return res.status(404).send('Product not found');
    if (product.seller.toString() !== req.user.id) {
        return res.status(403).redirect('/products');
    }
    await Product.findByIdAndDelete(id);
    res.status(200).redirect('/products');
});

app.post('/products/detailProduct/:id/buy', auth, async (req, res) => {
    const { id } = req.params;
    const requestedQty = parseInt(req.body.qty);
    const product = await Product.findById(id);
    if (!product) return res.status(404).send('Product not found');

    // Validasi Stok
    if (requestedQty > product.qty) {
        return res.status(400).send('Insufficient quantity');
    }

    // Validasi Saldo
    const totalPrice = product.price * requestedQty;
    const user = await User.findById(req.user.id);
    if (user.money < totalPrice) {
        return res.status(400).send('Saldo Anda tidak cukup. Silakan Top Up!');
    }

    // PROSES TRANSAKSI UANG
    const seller = await User.findById(product.seller);

    user.money -= totalPrice; // Potong uang pembeli
    if (seller) {
        seller.money += totalPrice; // Tambah uang penjual
        await seller.save();
    }
    await user.save();

    const newOrder = new Order({
        user: req.user.id,
        orderItem: [{
            name: product.name,
            qty: requestedQty,
            image: product.image,
            price: product.price,
            product: product._id
        }]
    });
    await newOrder.save();

    // Update Stok Produk
    product.qty -= requestedQty;
    if (product.qty <= 0) {
        await Product.findByIdAndDelete(id);
    } else {
        await product.save();
    }
    res.status(201).redirect('/');
});

// Controller for Topup
app.post('/topup', auth, async (req, res) => {
    const { amount } = req.body;
    const user = await User.findById(req.user.id);
    user.money += parseInt(amount);
    await user.save();
    res.status(200).redirect('/dashboard');
});

app.post('/shoppingCart', auth, async (req, res) => {
    const { productId } = req.body;
    const userId = req.user.id;

    try {
        const user = await User.findById(userId);

        //Jika user tidak memiliki array cart sama sekali
        if (!user.cart) user.cart = [];

        // Cari index produk di dalam keranjang
        const itemIndex = user.cart.findIndex(item =>
            item.productId && item.productId.toString() === productId
        );
        if (itemIndex > -1) {
            user.cart[itemIndex].qty += 1;
        } else {
            // Jika belum ada, tambah object baru
            user.cart.push({ productId: productId, qty: 1 });
        }

        await user.save();

        console.log("Berhasil simpan keranjang untuk user:", user.username);
        res.redirect('/shoppingCart');

    } catch (err) {
        console.error("Error Keranjang:", err);
        res.status(500).send("Gagal: " + err.message);
    }
});

app.post('/shoppingCart/:productId/remove', auth, async (req, res) => {
    try {
        const { productId } = req.params;
        // Ambil userId dari token JWT
        const userId = req.user.id;

        // Hapus produk dari cart menggunakan $pull
        await User.findByIdAndUpdate(userId, {
            $pull: { cart: { productId: productId } }
        });

        res.redirect('/shoppingCart');
    } catch (err) {
        res.status(500).send("Gagal: " + err.message);
    }
});




app.listen(process.env.PORT, () => {
    console.log('Server is running on http://localhost:' + process.env.PORT);
});