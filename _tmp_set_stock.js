
require('dotenv').config();
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.collection('products').updateOne(
    { slug: 'heavyweight-oversized-tee', 'variants.sku': 'TS001-BL-M' },
    { $set: { 'variants.$.stock': 0 } },
  );
  await mongoose.disconnect();
})();
