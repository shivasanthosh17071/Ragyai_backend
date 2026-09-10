import PDFDocument from 'pdfkit';
import { env } from '../config/env.js';

const money = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;

/** Streams a simple GST-style invoice straight to the HTTP response. */
export const streamInvoice = (order, res) => {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="invoice-${order.orderNumber}.pdf"`);
  doc.pipe(res);

  doc.fontSize(20).text(env.brandName, { align: 'left' });
  doc.fontSize(10).fillColor('#666').text('Tax Invoice', { align: 'left' });
  doc.moveDown();

  doc.fillColor('#000').fontSize(11);
  doc.text(`Invoice No: ${order.orderNumber}`);
  doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`);
  doc.text(`Payment: ${order.paymentMethod.toUpperCase()} (${order.paymentStatus})`);
  doc.moveDown();

  const a = order.shippingAddress || {};
  doc.font('Helvetica-Bold').text('Ship to:').font('Helvetica');
  doc.text(a.name || '');
  doc.text([a.line1, a.line2].filter(Boolean).join(', '));
  doc.text(`${a.city || ''}, ${a.state || ''} - ${a.pincode || ''}`);
  doc.text(`Phone: ${a.phone || ''}`);
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Items').font('Helvetica');
  doc.moveDown(0.3);
  order.items.forEach((it) => {
    const variant = [it.variant?.size, it.variant?.color].filter(Boolean).join(' / ');
    doc.text(`${it.productName}${variant ? ` (${variant})` : ''}  x${it.qty}`, { continued: true });
    doc.text(money(it.price * it.qty), { align: 'right' });
  });

  doc.moveDown();
  const row = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(label, { continued: true });
    doc.text(value, { align: 'right' });
  };
  row('Subtotal', money(order.subtotal));
  if (order.discount) row(`Discount${order.couponApplied?.code ? ` (${order.couponApplied.code})` : ''}`, `- ${money(order.discount)}`);
  row('Shipping', money(order.shippingFee));
  if (order.tax) row('Tax', money(order.tax));
  row('Total', money(order.totalAmount), true);

  doc.moveDown(2).fontSize(9).fillColor('#666')
    .text('This is a computer-generated invoice and does not require a signature.', { align: 'center' });

  doc.end();
};

export default streamInvoice;
