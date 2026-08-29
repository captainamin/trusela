import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import Layout from '../components/Layout';
import { FileDown, Share2, Smartphone, User, MapPin, Hash, Calendar, ShieldCheck, ArrowLeft, ShieldAlert, ShieldQuestion, Flag, Map, Package, RefreshCcw, Printer, MessageCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { getEmbedUrl } from '../utils/googleDrive';

export default function RecordDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [flagging, setFlagging] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showBuyerModal, setShowBuyerModal] = useState(false);
  const [showConfirmReturnModal, setShowConfirmReturnModal] = useState(false);
  const [showSaleCompleteModal, setShowSaleCompleteModal] = useState(false);
  const [buyerDetails, setBuyerDetails] = useState({ name: '', phone: '', address: '' });

  useEffect(() => {
    const fetchData = async () => {
      if (!auth.currentUser) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (!data || !data.spreadsheetId) {
            navigate('/setup');
            return;
          }
          setMetadata(data);
          const response = await axios.get(`/api/google/records?spreadsheetId=${data.spreadsheetId}&userId=${auth.currentUser.uid}`);
          const found = response.data.find((r: any) => String(r.id) === id);
          if (found) {
            setRecord(found);
          } else {
            toast.error('Record not found');
            navigate('/records');
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleFlag = async () => {
    if (!record?.imei1) return;
    const reason = window.prompt('Reason for flagging this IMEI?');
    if (!reason) return;

    setFlagging(true);
    try {
      await axios.post('/api/flag-imei', { imei: record.imei1, reason });
      toast.success('IMEI Flagged Successfully');
    } catch (error) {
      toast.error('Failed to flag IMEI');
    } finally {
      setFlagging(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string, details?: any) => {
    if (!metadata?.spreadsheetId || !record?.id) return;

    if (newStatus === 'SOLD' && !details) {
      setShowBuyerModal(true);
      return;
    }

    if (newStatus === 'IN_STOCK' && !details) {
      setShowConfirmReturnModal(true);
      return;
    }

    setFlagging(true);
    try {
      await axios.post('/api/google/update-record-status', {
        spreadsheetId: metadata.spreadsheetId,
        recordId: record.id,
        status: newStatus,
        buyerDetails: details,
        userId: auth.currentUser.uid
      });
      setRecord({
        ...record,
        deviceStatus: newStatus,
        buyerName: details?.name || '',
        buyerPhone: details?.phone || '',
        buyerAddress: details?.address || ''
      });
      toast.success(`Device marked as ${newStatus === 'SOLD' ? 'Sold' : 'In Stock'}`);
      setShowBuyerModal(false);
      setShowConfirmReturnModal(false);
      if (newStatus === 'SOLD') {
        setShowSaleCompleteModal(true);
      }
    } catch (error) {
      toast.error('Failed to update status');
    } finally {
      setFlagging(false);
    }
  };

  const generatePDF = async () => {
    const isTrialExpired = metadata?.subscriptionStatus === 'trial' && new Date(metadata.trialEndsAt) < new Date();
    if (isTrialExpired && metadata?.subscriptionStatus !== 'active') {
      toast.error('Subscription required to generate PDF');
      navigate('/subscription');
      return;
    }

    toast.info('Generating High-Fidelity Receipt...');
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Helper to add image from URL
    const addImageFromUrl = async (url: string, x: number, y: number, w: number, h: number, format: 'JPEG' | 'PNG' = 'JPEG') => {
      try {
        if (!url) return;
        const embedUrl = getEmbedUrl(url, auth.currentUser?.uid);
        console.log(`[PDF] Fetching image from: ${embedUrl}`);
        const resp = await fetch(embedUrl);
        if (!resp.ok) {
          console.error(`[PDF] Fetch failed for ${url}: ${resp.status}`);
          throw new Error(`HTTP ${resp.status} fetching image`);
        }
        
        const blob = await resp.blob();
        console.log(`[PDF] Blob received: ${blob.type}, size: ${blob.size}`);
        
        if (blob.type === 'text/html') {
          const text = await blob.text();
          console.error(`[PDF] Error: Proxy returned HTML instead of image. Content: ${text.substring(0, 200)}...`);
          throw new Error('Proxy returned HTML instead of image');
        }
        
        const reader = new FileReader();
        return new Promise<void>((resolve, reject) => {
          reader.onloadend = () => {
            const base64 = reader.result as string;
            console.log(`[PDF] Base64 generated, length: ${base64.length}`);
            // jsPDF addImage can auto-detect format from data URI if we pass it correctly
            const imageFormat = blob.type === 'image/png' ? 'PNG' : 'JPEG';
            try {
              doc.addImage(base64, imageFormat, x, y, w, h, undefined, 'FAST');
              console.log(`[PDF] Image added to document: ${url}`);
              resolve();
            } catch (err) {
              console.error('[PDF] jsPDF addImage error:', err);
              reject(err);
            }
          };
          reader.onerror = (err) => {
             console.error('[PDF] FileReader error:', err);
             reject(err);
          };
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn('Failed to add image to PDF:', url, e);
        doc.setDrawColor(200, 200, 200);
        doc.rect(x, y, w, h);
      }
    };

    // 0. Watermark
    doc.setTextColor(235, 235, 235);
    doc.setFontSize(60);
    doc.setFont('helvetica', 'bold');
    for (let i = 0; i < 5; i++) {
      doc.text('TRUSELA SECURED', 30, 60 + (i * 50), { angle: 45 });
    }

    // 1. Header Area
    doc.setFillColor(0, 31, 63); // Navy
    doc.rect(0, 0, pageWidth, 45, 'F');

    // Left: Logo/Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('TRUSELA', 20, 25);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('SECURE PHONE DEALER RECEIPT', 20, 32);

    // Right: Device info (Aligned Right)
    doc.setFontSize(10);
    doc.text(`${record.brand} ${record.model}`, pageWidth - 20, 15, { align: 'right' });
    doc.text(`IMEI 1: ${record.imei1}`, pageWidth - 20, 21, { align: 'right' });
    doc.text(`IMEI 2: ${record.imei2 || 'N/A'}`, pageWidth - 20, 27, { align: 'right' });
    doc.text(`Date: ${record.date}`, pageWidth - 20, 33, { align: 'right' });
    doc.text(`ID: ${record.id}`, pageWidth - 20, 39, { align: 'right' });

    // 2. Seller Row (Details Left, Photo Right)
    doc.setTextColor(0, 31, 63);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('SELLER DETAILS', 20, 60);

    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${record.sellerName}`, 20, 68);
    doc.text(`Phone: ${record.phoneNumber}`, 20, 75);
    doc.text(`Address: ${record.address}`, 20, 82, { maxWidth: 100 });

    // Seller Photo on Right
    if (record.sellerPhotoUrl) {
      await addImageFromUrl(record.sellerPhotoUrl, pageWidth - 65, 52, 45, 60);
      doc.setDrawColor(0, 31, 63);
      doc.rect(pageWidth - 65, 52, 45, 60);
    }

    // 3. Three Portraits Grid (Front, Back, ID)
    doc.setTextColor(0, 31, 63);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('IDENTIFICATION & DEVICE VERIFICATION', 20, 125);

    const colW = 55;
    const colH = 73; // 3:4 ratio approx
    const gap = 8;
    const gridY = 130;

    if (record.deviceImg1Url) {
      await addImageFromUrl(record.deviceImg1Url, 20, gridY, colW, colH);
      doc.setFontSize(7);
      doc.text('DEVICE FRONT', 20 + colW / 2, gridY + colH + 4, { align: 'center' });
    }
    if (record.deviceImg2Url) {
      await addImageFromUrl(record.deviceImg2Url, 20 + colW + gap, gridY, colW, colH);
      doc.text('DEVICE BACK', 20 + colW + gap + colW / 2, gridY + colH + 4, { align: 'center' });
    }
    if (record.idCardPhotoUrl) {
      await addImageFromUrl(record.idCardPhotoUrl, 20 + (colW + gap) * 2, gridY, colW, colH);
      doc.text('SELLER ID CARD', 20 + (colW + gap) * 2 + colW / 2, gridY + colH + 4, { align: 'center' });
    }

    // 4. Buyer Info (If Sold)
    let nextY = 215;
    if (record.deviceStatus === 'SOLD' && record.buyerName) {
      doc.setTextColor(0, 31, 63);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('BUYER INFORMATION', 20, nextY);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Name: ${record.buyerName} | Phone: ${record.buyerPhone}`, 20, nextY + 6);
      doc.text(`Address: ${record.buyerAddress}`, 20, nextY + 12);
      nextY += 25;
    }

    // 5. Attestation & Signature
    doc.setFillColor(245, 247, 250);
    doc.rect(15, nextY, pageWidth - 30, 45, 'F');

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    const attestation = `I, ${record.sellerName}, hereby solemnly attest and declare that I am the legal and rightful owner of the ${record.brand} ${record.model} (IMEI: ${record.imei1}) described in this document. I further confirm that this device was obtained through lawful means and is free from any liens, encumbrances, or criminal associations. I accept full legal responsibility for the accuracy of this statement and the authenticity of the identification provided.`;
    doc.text(attestation, 20, nextY + 8, { maxWidth: pageWidth - 40 });

    if (record.signatureUrl) {
      await addImageFromUrl(record.signatureUrl, 20, nextY + 22, 50, 20, 'PNG');
      doc.setFont('helvetica', 'bold');
      doc.text('Seller\'s Digital Signature', 20, nextY + 42);
    }

    // 6. QR Code & Dealer Branding
    const qrY = pageHeight - 45;
    const verificationUrl = `${window.location.origin}/records/${record.id}`;
    const qrDataUrl = await QRCode.toDataURL(verificationUrl);
    doc.addImage(qrDataUrl, 'PNG', pageWidth - 45, qrY, 30, 30);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('SCAN TO VERIFY AUTHENTICITY', pageWidth - 30, qrY + 33, { align: 'center' });

    // Dealer Stamp/Info on bottom left
    doc.setTextColor(100, 100, 100);
    doc.text(`Authenticated by: ${metadata?.dealerName || 'Authorized Dealer'}`, 20, qrY + 20);
    doc.text(`Market/Shop: ${metadata?.marketName || 'N/A'} - ${metadata?.shopNumber || 'N/A'}`, 20, qrY + 25);

    // Footer
    doc.setDrawColor(0, 31, 63);
    doc.line(20, pageHeight - 15, pageWidth - 20, pageHeight - 15);
    doc.text('TRUSELA SECURE RECORDING SYSTEM - TRUST BY DESIGN', pageWidth / 2, pageHeight - 10, { align: 'center' });

    doc.save(`Trusela_Receipt_${record.sellerName}.pdf`);
    toast.success('Premium PDF Downloaded');
  };

  const printThermalReceipt = async () => {
    try {
      if (!navigator.bluetooth) {
        toast.error('Web Bluetooth is not supported on this browser/device.');
        return;
      }
      toast.info('Select your Bluetooth Printer...');
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '00001800-0000-1000-8000-00805f9b34fb', '00001801-0000-1000-8000-00805f9b34fb']
      });

      const server = await device.gatt?.connect();
      if (!server) throw new Error('Could not connect to printer');

      const services = await server.getPrimaryServices();
      let printCharacteristic;

      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            printCharacteristic = char;
            break;
          }
        }
        if (printCharacteristic) break;
      }

      if (!printCharacteristic) throw new Error('Print characteristic not found on this device');

      toast.loading('Sending receipt to printer...', { id: 'printing' });

      // Build ESC/POS payload
      const encoder = new TextEncoder();
      const ESC = '\\x1B';
      let buffer = encoder.encode(`${ESC}@`); // Init

      const addText = (text: string) => {
        const t = encoder.encode(text + '\\n');
        const newBuf = new Uint8Array(buffer.length + t.length);
        newBuf.set(buffer);
        newBuf.set(t, buffer.length);
        buffer = newBuf;
      };

      const addCmd = (cmd: string) => {
        const c = encoder.encode(cmd);
        const newBuf = new Uint8Array(buffer.length + c.length);
        newBuf.set(buffer);
        newBuf.set(c, buffer.length);
        buffer = newBuf;
      };

      addCmd(`${ESC}a1`); // Center align
      addCmd(`${ESC}!0x10`); // Double height
      addText('TRUSELA');
      addCmd(`${ESC}!0x00`); // Normal
      addText('SECURE PHONE RECEIPT');
      addText('--------------------------------');

      addCmd(`${ESC}a0`); // Left align
      addText(`Date: ${record.date}`);
      addText(`Time: ${new Date().toLocaleTimeString()}`);
      addText(`Device: ${record.brand} ${record.model}`);
      addText(`IMEI 1: ${record.imei1}`);
      addText(`Status: CLEAN / ${record.riskLevel} RISK`);
      addText('--------------------------------');

      addText('SELLER DETAILS');
      addText(`Name: ${record.sellerName}`);
      addText(`Phone: ${record.phoneNumber}`);
      addText('--------------------------------');

      const bName = buyerDetails?.name || record.buyerName;
      if (bName) {
        addText('BUYER DETAILS');
        addText(`Name: ${bName}`);
        addText(`Phone: ${buyerDetails?.phone || record.buyerPhone}`);
        addText('--------------------------------');
      }

      addCmd(`${ESC}a1`); // Center align
      addText('Scan QR to Verify Authenticity');
      addText(window.location.href);
      addText('');
      addText('Authenticated by Trusela');
      addText('Tested & Verified. Trust by Design.');
      addText('');
      addText('');
      addText(''); // feed paper

      // Send chunked data (Web Bluetooth characteristic value is limited, usually 512 bytes)
      const chunkSize = 200;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.slice(i, i + chunkSize);
        await printCharacteristic.writeValue(chunk);
      }

      toast.success('Printed successfully!', { id: 'printing' });
    } catch (error: any) {
      console.error(error);
      toast.error('Printing failed: ' + error.message, { id: 'printing' });
    }
  };

  const shareReceipt = () => {
    const bName = buyerDetails?.name || record.buyerName;
    const text = `*TRUSELA SECURE RECEIPT* 📱\n\n*Device:* ${record.brand} ${record.model}\n*IMEI 1:* ${record.imei1}\n*Status:* ${record.riskLevel === 'LOW' ? 'CLEAN ✅' : record.riskLevel + ' ⚠️'}\n\n*Seller:* ${record.sellerName}\n${bName ? `*Buyer:* ${bName}\n` : ''}*Date:* ${new Date().toLocaleDateString()}\n\n*Verify Authenticity:* ${window.location.href}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  if (loading) return <Layout title="Loading..."><div className="animate-pulse h-64 bg-gray-200 rounded-xl" /></Layout>;

  return (
    <Layout title="Record Details">
      <div className="space-y-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-navy font-medium">
          <ArrowLeft className="w-4 h-4" /> Back to List
        </button>

        <div className="card space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-navy/5 rounded-2xl flex items-center justify-center text-navy">
              <User className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-navy">{record.sellerName}</h3>
              <p className="text-gray-500">{record.phoneNumber}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="text-gray-400 w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Address</p>
                      <p className="text-sm font-medium">{record.address}</p>
                    </div>
                    <button
                      onClick={() => setShowMap(!showMap)}
                      className="text-[10px] font-bold text-navy bg-navy/5 px-2 py-1 rounded hover:bg-navy/10 transition-colors flex items-center gap-1"
                    >
                      <Map className="w-3 h-3" /> {showMap ? 'Hide Map' : 'View Map'}
                    </button>
                  </div>
                  {showMap && (
                    <div className="mt-3 rounded-xl overflow-hidden border border-gray-200 h-48 animate-in fade-in zoom-in duration-300">
                      <iframe
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        style={{ border: 0 }}
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(record.address)}&output=embed`}
                        allowFullScreen
                      ></iframe>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Smartphone className="text-gray-400 w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Device</p>
                  <p className="text-sm font-medium">{record.brand} {record.model}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Hash className="text-gray-400 w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">IMEI Numbers</p>
                  <p className="text-sm font-mono">{record.imei1}</p>
                  <p className="text-sm font-mono">{record.imei2}</p>

                  <div className={`mt-2 p-3 rounded-lg border flex items-center gap-2 ${record.riskLevel === 'HIGH' ? 'bg-red-50 border-red-100 text-red-700' :
                      record.riskLevel === 'MEDIUM' ? 'bg-orange-50 border-orange-100 text-orange-700' :
                        'bg-green-50 border-green-100 text-green-700'
                    }`}>
                    {record.riskLevel === 'HIGH' ? <ShieldAlert className="w-4 h-4" /> :
                      record.riskLevel === 'MEDIUM' ? <ShieldQuestion className="w-4 h-4" /> :
                        <ShieldCheck className="w-4 h-4" />}
                    <span className="text-xs font-bold uppercase">{record.imeiStatus}: {record.riskLevel} RISK</span>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Package className="text-gray-400 w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Device Status</p>
                      <p className={`text-sm font-bold ${record.deviceStatus === 'SOLD' ? 'text-yellow-600' : 'text-green-600'}`}>
                        {record.deviceStatus === 'SOLD' ? 'Sold' : 'In Stock'}
                      </p>
                    </div>
                    {metadata?.planType === 'manager' && (
                      <button
                        onClick={() => handleUpdateStatus(record.deviceStatus === 'SOLD' ? 'IN_STOCK' : 'SOLD')}
                        disabled={flagging}
                        className="text-[10px] font-bold text-navy bg-navy/5 px-2 py-1 rounded hover:bg-navy/10 transition-colors flex items-center gap-1"
                      >
                        <RefreshCcw className="w-3 h-3" /> Mark as {record.deviceStatus === 'SOLD' ? 'In Stock' : 'Sold'}
                      </button>
                    )}
                  </div>
                  {record.deviceStatus === 'SOLD' && record.buyerName && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-1">
                      <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Buyer Details</p>
                      <p className="text-xs font-bold text-navy">{record.buyerName}</p>
                      <p className="text-xs text-gray-500">{record.buyerPhone}</p>
                      <p className="text-xs text-gray-500">{record.buyerAddress}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="text-gray-400 w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Transaction Date</p>
                  <p className="text-sm font-medium">{record.date}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Seller Photo</p>
              {record.sellerPhotoUrl ? (
                <img src={getEmbedUrl(record.sellerPhotoUrl, auth.currentUser?.uid)} className="w-full rounded-xl aspect-video object-cover border" referrerPolicy="no-referrer" alt="Seller" />
              ) : (
                <div className="w-full rounded-xl aspect-video bg-gray-100 flex items-center justify-center text-gray-400 border border-dashed">No Photo</div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {record.deviceImg1Url ? (
                  <div className="space-y-1">
                    <img src={getEmbedUrl(record.deviceImg1Url, auth.currentUser?.uid)} className="w-full rounded-lg aspect-[3/4] object-cover border" referrerPolicy="no-referrer" alt="Front" />
                    <p className="text-[8px] text-center text-gray-400 font-bold uppercase">Front View</p>
                  </div>
                ) : (
                  <div className="w-full rounded-lg aspect-[3/4] bg-gray-100 flex items-center justify-center text-gray-400 border border-dashed text-[8px]">No Front</div>
                )}
                {record.deviceImg2Url ? (
                  <div className="space-y-1">
                    <img src={getEmbedUrl(record.deviceImg2Url, auth.currentUser?.uid)} className="w-full rounded-lg aspect-[3/4] object-cover border" referrerPolicy="no-referrer" alt="Back" />
                    <p className="text-[8px] text-center text-gray-400 font-bold uppercase">Back View</p>
                  </div>
                ) : (
                  <div className="w-full rounded-lg aspect-[3/4] bg-gray-100 flex items-center justify-center text-gray-400 border border-dashed text-[8px]">No Back</div>
                )}
                {record.idCardPhotoUrl ? (
                  <div className="space-y-1">
                    <img src={getEmbedUrl(record.idCardPhotoUrl, auth.currentUser?.uid)} className="w-full rounded-lg aspect-[3/4] object-cover border" referrerPolicy="no-referrer" alt="ID Card" />
                    <p className="text-[8px] text-center text-gray-400 font-bold uppercase">ID Card</p>
                  </div>
                ) : (
                  <div className="w-full rounded-lg aspect-[3/4] bg-gray-100 flex items-center justify-center text-gray-400 border border-dashed text-[8px]">No ID Card</div>
                )}
              </div>

              <div className="space-y-1 pt-2">
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Seller Signature</p>
                {record.signatureUrl ? (
                  <div className="bg-white rounded-xl py-2 px-4 shadow-sm border border-navy/5 flex justify-center">
                    <img src={getEmbedUrl(record.signatureUrl, auth.currentUser?.uid)} className="max-h-16 object-contain" referrerPolicy="no-referrer" alt="Signature" />
                  </div>
                ) : (
                  <div className="w-full h-16 bg-gray-50 flex items-center justify-center text-gray-400 border border-dashed rounded-xl text-[10px]">No Signature Captured</div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-4 border-t">
            <button onClick={generatePDF} className="flex-1 btn-primary flex items-center justify-center gap-2 py-3 min-w-[200px]">
              <FileDown className="w-5 h-5" /> Download PDF
            </button>
            <button onClick={printThermalReceipt} className="flex-1 bg-gray-50 text-gray-700 border border-gray-200 rounded-xl font-bold flex items-center justify-center gap-2 py-3 min-w-[200px] hover:bg-gray-100 transition-colors">
              <Printer className="w-5 h-5" /> Print Thermal
            </button>
            <button onClick={shareReceipt} className="flex-1 bg-green-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 py-3 min-w-[200px] hover:bg-green-600 transition-colors">
              <MessageCircle className="w-5 h-5" /> WhatsApp Receipt
            </button>
            <button
              onClick={handleFlag}
              disabled={flagging}
              className="px-6 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <Flag className="w-5 h-5" /> Flag
            </button>
          </div>
        </div>
      </div>

      {showBuyerModal && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-300">
            <h3 className="text-xl font-bold text-navy mb-4">Buyer Information</h3>
            <p className="text-sm text-gray-500 mb-6">Please record the details of the buyer for this transaction.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Buyer Name</label>
                <input
                  id="buyerName"
                  name="buyerName"
                  type="text"
                  value={buyerDetails.name}
                  onChange={(e) => setBuyerDetails({ ...buyerDetails, name: e.target.value })}
                  className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-navy font-medium focus:ring-2 focus:ring-navy/10"
                  placeholder="Full Name"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Phone Number</label>
                <input
                  id="buyerPhone"
                  name="buyerPhone"
                  type="tel"
                  value={buyerDetails.phone}
                  onChange={(e) => setBuyerDetails({ ...buyerDetails, phone: e.target.value })}
                  className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-navy font-medium focus:ring-2 focus:ring-navy/10"
                  placeholder="080..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Address</label>
                <textarea
                  id="buyerAddress"
                  name="buyerAddress"
                  value={buyerDetails.address}
                  onChange={(e) => setBuyerDetails({ ...buyerDetails, address: e.target.value })}
                  className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-navy font-medium focus:ring-2 focus:ring-navy/10 h-24 resize-none"
                  placeholder="Buyer's Address"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowBuyerModal(false)}
                className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdateStatus('SOLD', buyerDetails)}
                disabled={!buyerDetails.name || !buyerDetails.phone || flagging}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-navy hover:bg-navy/90 transition-colors disabled:opacity-50"
              >
                {flagging ? 'Processing...' : 'Confirm Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmReturnModal && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-yellow/10 rounded-2xl flex items-center justify-center text-yellow-600 mb-6">
              <RefreshCcw className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-navy mb-2">Return to Stock?</h3>
            <p className="text-sm text-gray-500 mb-8">
              Are you sure you want to return this device to stock? This will clear the current buyer information.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmReturnModal(false)}
                className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdateStatus('IN_STOCK', {})}
                disabled={flagging}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-navy hover:bg-navy/90 transition-colors disabled:opacity-50"
              >
                {flagging ? 'Processing...' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaleCompleteModal && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in fade-in zoom-in duration-300 text-center">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center text-green-500 mx-auto mb-6">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-navy mb-2">Sale Completed!</h3>
            <p className="text-sm text-gray-500 mb-8">
              The device has been successfully registered to the buyer. Provide the receipt to complete the transaction.
            </p>

            <div className="space-y-3">
              <button onClick={() => { generatePDF(); setShowSaleCompleteModal(false); }} className="w-full btn-primary flex items-center justify-center gap-2 py-4 shadow-lg shadow-yellow/20">
                <FileDown className="w-5 h-5" /> Generate High-Fidelity PDF
              </button>
              <button onClick={() => { shareReceipt(); setShowSaleCompleteModal(false); }} className="w-full bg-[#25D366] hover:bg-[#1DA851] text-white rounded-xl font-bold flex items-center justify-center gap-2 py-4 transition-colors">
                <MessageCircle className="w-5 h-5" /> Send via WhatsApp
              </button>
              <button onClick={() => { printThermalReceipt(); setShowSaleCompleteModal(false); }} className="w-full bg-gray-50 text-gray-700 border border-gray-200 rounded-xl font-bold flex items-center justify-center gap-2 py-4 hover:bg-gray-100 transition-colors">
                <Printer className="w-5 h-5" /> Print Thermal Receipt
              </button>
            </div>
            
            <button onClick={() => setShowSaleCompleteModal(false)} className="mt-6 text-sm font-bold text-gray-400 hover:text-navy transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
