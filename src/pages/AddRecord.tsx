import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from '../firebase';
import Layout from '../components/Layout';
import { Camera, Save, Smartphone, User, MapPin, Hash, CheckCircle, AlertCircle, Scan, ShieldAlert, ShieldCheck, ShieldQuestion, RefreshCcw, Package } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { Html5Qrcode } from 'html5-qrcode';
import { toJpeg, toPng } from 'html-to-image';
import { useUser } from '../contexts/UserContext';

export default function AddRecord() {
  const { user, metadata, loading: userLoading } = useUser();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const location = useLocation();
  const inventoryMode = location.state?.inventoryMode as 'product' | 'stock' | undefined;
  const [isPremium, setIsPremium] = useState(false);
  const [recordCount, setRecordCount] = useState(0);

  const [formData, setFormData] = useState({
    sellerName: '',
    phoneNumber: '',
    address: '',
    sellerPhoto: '',
    idCardPhoto: '',
    brand: '',
    model: '',
    imei1: '',
    imei2: '',
    deviceImg1: '',
    deviceImg2: '',
    signature: '',
    confirmed: false,
    imeiStatus: 'NEW',
    riskLevel: 'LOW',
    deviceStatus: 'IN_STOCK'
  });

  const [imeiVerification, setImeiVerification] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    if (!userLoading && metadata) {
      setIsPremium(metadata.subscriptionStatus === 'active');
      setRecordCount(metadata.recordCount || 0);
    }
  }, [metadata, userLoading]);

  useEffect(() => {
    // Check for IMEI in location state
    if (location.state?.imei) {
      const imei = location.state.imei;
      setFormData(prev => ({ ...prev, imei1: imei }));
      
      // Check for cached verification result
      const cached = localStorage.getItem(`imei_cache_${imei}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setImeiVerification(parsed);
        setFormData(prev => ({
          ...prev,
          imeiStatus: parsed.status,
          riskLevel: parsed.risk
        }));
      }
    }
  }, [location.state]);

  useEffect(() => {
    let html5QrCode: Html5Qrcode;

    if (showScanner) {
      html5QrCode = new Html5Qrcode('reader');

      const onScanSuccess = (decodedText: string) => {
        if (html5QrCode.isScanning) {
          html5QrCode.stop().catch(e => console.error(e));
        }

        setFormData(prev => ({ ...prev, imei1: decodedText }));
        setShowScanner(false);
        toast.success('IMEI Scanned Successfully');
      };

      html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.777778 },
        onScanSuccess,
        () => {} // Silent error
      ).catch((err) => {
        console.error("Camera start error:", err);
        toast.error("Could not start camera. Please check permissions.");
      });

      return () => {
        if (html5QrCode && html5QrCode.isScanning) {
          html5QrCode.stop().then(() => {
            html5QrCode.clear();
          }).catch(e => console.error('Scanner cleanup failed', e));
        }
      };
    }
  }, [showScanner]);

  const verifyIMEI = async () => {
    if (!formData.imei1) {
      toast.error('Please enter IMEI 1 first');
      return;
    }
    if (!isPremium) {
      toast.error('IMEI Verification is a Premium feature');
      navigate('/subscription');
      return;
    }

    const cacheKey = `imei_cache_${formData.imei1}`;
    const cachedData = localStorage.getItem(cacheKey);

    if (!navigator.onLine) {
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        setImeiVerification(parsedData);
        setFormData(prev => ({
          ...prev,
          imeiStatus: parsedData.status,
          riskLevel: parsedData.risk
        }));
        toast.success('IMEI Verification (Offline Cache)');
        return;
      } else {
        toast.error('You are offline and no cached result found for this IMEI');
        return;
      }
    }

    setVerifying(true);
    try {
      const response = await axios.post('/api/verify-imei', { imei: formData.imei1 });
      setImeiVerification(response.data);
      setFormData(prev => ({
        ...prev,
        imeiStatus: response.data.status,
        riskLevel: response.data.risk
      }));
      
      // Save to cache
      localStorage.setItem(cacheKey, JSON.stringify(response.data));
      
      toast.success('IMEI Verification Complete');
    } catch (error) {
      toast.error('Failed to verify IMEI');
    } finally {
      setVerifying(false);
    }
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturing, setCapturing] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [successReceipt, setSuccessReceipt] = useState<string | null>(null);

  const startCamera = async (field: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCapturing(field);
    } catch (err) {
      toast.error('Could not access camera');
    }
  };

  useEffect(() => {
    if (capturing && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [capturing]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCapturing(null);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        const video = videoRef.current;
        const vWidth = video.videoWidth;
        const vHeight = video.videoHeight;
        
        // Enforce 3:4 Portrait Ratio
        // Target: W = H * 0.75
        let targetWidth, targetHeight;
        if (vWidth / vHeight > 0.75) {
          // Video is too wide (landscape), crop sides
          targetHeight = vHeight;
          targetWidth = vHeight * 0.75;
        } else {
          // Video is too tall, crop top/bottom
          targetWidth = vWidth;
          targetHeight = vWidth / 0.75;
        }

        canvasRef.current.width = targetWidth;
        canvasRef.current.height = targetHeight;
        
        const offsetX = (vWidth - targetWidth) / 2;
        const offsetY = (vHeight - targetHeight) / 2;

        context.drawImage(video, offsetX, offsetY, targetWidth, targetHeight, 0, 0, targetWidth, targetHeight);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
        setFormData(prev => ({ ...prev, [capturing!]: dataUrl }));
        stopCamera();
      }
    }
  };

  const SignaturePad = ({ onSave }: { onSave: (data: string) => void }) => {
    const sigCanvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    useEffect(() => {
      const canvas = sigCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.strokeStyle = '#001F3F';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
    }, []);

    const startDrawing = (e: any) => {
      setIsDrawing(true);
      draw(e);
    };

    const stopDrawing = () => {
      setIsDrawing(false);
      const canvas = sigCanvasRef.current;
      if (canvas) {
        onSave(canvas.toDataURL('image/png'));
      }
    };

    const draw = (e: any) => {
      if (!isDrawing) return;
      const canvas = sigCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
      const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const clear = () => {
      const canvas = sigCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      onSave('');
    };

    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <p className="text-xs font-bold text-gray-400 uppercase">Seller's Signature</p>
          <button onClick={clear} className="text-[10px] text-red-500 font-bold flex items-center gap-1">
            <RefreshCcw className="w-3 h-3" /> Clear
          </button>
        </div>
        <canvas
          ref={sigCanvasRef}
          width={400}
          height={200}
          className="w-full h-40 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseUp={stopDrawing}
          onMouseMove={draw}
          onTouchStart={startDrawing}
          onTouchEnd={stopDrawing}
          onTouchMove={draw}
        />
      </div>
    );
  };

  const handleSave = async () => {
    if (!formData.confirmed) {
      toast.error('Please confirm the device is not stolen');
      return;
    }
    
    if (!receiptRef.current) {
      toast.error('Error generating receipt');
      return;
    }

    setLoading(true);
    toast.info('Generating receipt...');
    
    try {
      // Generate PNG of the receipt
      const receiptBase64 = await toPng(receiptRef.current, {
        pixelRatio: 2, // Higher quality
        backgroundColor: '#ffffff'
      });

      const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
      const userData = userDoc.data();
      if (!userData || !userData.spreadsheetId) {
        toast.error('Account setup incomplete. Please finish setup first.');
        navigate('/setup');
        return;
      }
      const { spreadsheetId, folderId, subscriptionStatus, trialEndsAt, recordCount } = userData;

      // Check limits
      const isTrialExpired = subscriptionStatus === 'trial' && new Date(trialEndsAt) < new Date();
      if (isTrialExpired && subscriptionStatus !== 'active') {
        toast.error('Subscription required to add more records');
        navigate('/subscription');
        return;
      }

      if (subscriptionStatus === 'trial' && recordCount >= 5) {
        toast.error('Trial limit reached (5 records). Please subscribe.');
        navigate('/subscription');
        return;
      }

      // Generate an idempotent ID for this specific save attempt
      const recordPayload = {
        ...formData,
        receiptImage: receiptBase64,
        id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 5)
      };

      if (!navigator.onLine) {
        // Offline Save
        const pendingRecords = JSON.parse(localStorage.getItem('pending_records') || '[]');
        pendingRecords.push({
          ...recordPayload,
          userId: auth.currentUser!.uid,
          spreadsheetId,
          folderId,
          timestamp: new Date().toISOString()
        });
        localStorage.setItem('pending_records', JSON.stringify(pendingRecords));
        
        toast.success('Record saved locally (Offline).');
        setSuccessReceipt(receiptBase64);
        return;
      }

      toast.info('Uploading receipt and saving record...');
      const response = await axios.post('/api/google/save-record', {
        spreadsheetId: spreadsheetId,
        folderId: folderId,
        userId: auth.currentUser?.uid,
        record: {
          ...recordPayload,
          imeiStatus: imeiVerification?.status || 'NEW',
          riskLevel: imeiVerification?.risk || 'LOW'
        }
      });

      // Update IMEI database
      if (recordPayload.imei1) {
        await axios.post('/api/save-imei', { imei: recordPayload.imei1, userId: auth.currentUser?.uid });
      }

      toast.success('Record saved successfully!');
      setSuccessReceipt(receiptBase64);
    } catch (error: any) {
      console.error(error);
      let errorMsg = 'Failed to save record';
      if (error.response?.data) {
        const { error: errStr, details } = error.response.data;
        if (details && Array.isArray(details)) {
          errorMsg = details.map((d: any) => d.message).join(', ');
        } else if (typeof errStr === 'string') {
          errorMsg = errStr;
        } else if (typeof error.response.data.error === 'string') {
          errorMsg = error.response.data.error;
        } else {
          errorMsg = error.response.data.details || error.message || 'Failed to save record';
        }
      } else {
        errorMsg = error.message || 'Failed to save record';
      }
      toast.error(typeof errorMsg === 'string' ? errorMsg : 'Validation Error');
    } finally {
      setLoading(false);
    }
  };

  if (successReceipt) {
    return (
      <Layout title="Record Saved">
        <div className="max-w-md mx-auto space-y-6">
          <div className="bg-emerald-50 text-emerald-700 p-6 rounded-2xl flex flex-col items-center text-center">
            <CheckCircle className="w-12 h-12 mb-4" />
            <h2 className="text-xl font-bold mb-2">Successfully Saved!</h2>
            <p className="text-sm">The record has been saved and the receipt image was uploaded to your Google Drive.</p>
          </div>
          
          <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <img src={successReceipt} alt="Receipt" className="w-full h-auto" />
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={() => {
                if (navigator.share) {
                  fetch(successReceipt)
                    .then(res => res.blob())
                    .then(blob => {
                      const file = new File([blob], 'receipt.png', { type: 'image/png' });
                      navigator.share({
                        title: 'Device Record Receipt',
                        files: [file]
                      }).catch(console.error);
                    });
                } else {
                  toast.error('Sharing not supported on this device');
                }
              }}
              className="flex-1 bg-navy text-white py-4 rounded-xl font-bold flex justify-center items-center gap-2"
            >
              Share
            </button>
            <a 
              href={successReceipt} 
              download={`Record_${formData.imei1 || formData.phoneNumber}.png`}
              className="flex-1 bg-emerald-600 text-white py-4 rounded-xl font-bold flex justify-center items-center gap-2"
            >
              Download
            </a>
          </div>

          <button onClick={() => navigate('/')} className="w-full py-4 text-navy font-bold hover:bg-gray-50 rounded-xl transition-colors">
            Return to Dashboard
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={inventoryMode === 'stock' ? 'Add Stock' : inventoryMode === 'product' ? 'Add Product' : 'Add New Record'}>
      {/* Hidden Receipt Template for html2canvas */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '850px' }}>
        <div ref={receiptRef} className="bg-white p-10" style={{ width: '850px', fontFamily: '"Inter", sans-serif', color: '#1f2937' }}>
          
          {/* Header */}
          <div className="flex justify-between items-center border-b-4 border-emerald-800 pb-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-emerald-800 text-white flex items-center justify-center rounded-2xl font-black text-3xl shadow-md">
                T
              </div>
              <div>
                <h1 className="text-3xl font-black text-emerald-900 tracking-tight">TRUSELA</h1>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mt-1">Official Seller Record</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-gray-800">Date: {new Date().toLocaleDateString()}</p>
              <p className="text-sm text-gray-500">Time: {new Date().toLocaleTimeString()}</p>
              <p className="text-sm font-mono text-gray-500 mt-1">Ref: {Date.now().toString().slice(-8)}</p>
            </div>
          </div>

          {/* Marketer & Market Details */}
          <div className="bg-emerald-50/80 rounded-2xl p-6 mb-8 border border-emerald-100 flex justify-between shadow-sm">
            <div>
              <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest mb-1">Marketer Details</p>
              <p className="font-black text-gray-900 text-lg">{metadata?.fullName || user?.displayName || 'Authorized Agent'}</p>
              <p className="text-sm font-medium text-gray-600">{metadata?.phone || user?.email || 'Registered User'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest mb-1">Market / Location Details</p>
              <p className="font-black text-gray-900 text-lg">{metadata?.marketName || metadata?.businessName || 'Trusela Verified Location'}</p>
              <p className="text-sm font-medium text-gray-600">{metadata?.shopNumber ? `Shop: ${metadata.shopNumber}` : 'Official Record'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-8">
            {/* Seller Details */}
            <div className="border border-gray-200 rounded-2xl p-6 shadow-sm bg-white">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" /> Seller Information
              </h2>
              <div className="space-y-4 text-sm">
                <div className="flex justify-between border-b border-gray-50 pb-3">
                  <span className="text-gray-500 font-medium">Full Name</span>
                  <span className="font-bold text-gray-900">{formData.sellerName}</span>
                </div>
                <div className="flex justify-between border-b border-gray-50 pb-3">
                  <span className="text-gray-500 font-medium">Phone Number</span>
                  <span className="font-bold text-gray-900">{formData.phoneNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Address</span>
                  <span className="font-bold text-gray-900 text-right max-w-[200px] truncate" title={formData.address}>{formData.address || 'N/A'}</span>
                </div>
              </div>
            </div>
            
            {/* Device Details */}
            <div className="border border-gray-200 rounded-2xl p-6 shadow-sm bg-white">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600" /> Device Information
              </h2>
              <div className="space-y-4 text-sm">
                <div className="flex justify-between border-b border-gray-50 pb-3">
                  <span className="text-gray-500 font-medium">Make & Model</span>
                  <span className="font-bold text-gray-900">{formData.brand} {formData.model}</span>
                </div>
                <div className="flex justify-between border-b border-gray-50 pb-3">
                  <span className="text-gray-500 font-medium">Primary IMEI</span>
                  <span className="font-bold font-mono text-gray-900">{formData.imei1}</span>
                </div>
                {formData.imei2 && (
                  <div className="flex justify-between border-b border-gray-50 pb-3">
                    <span className="text-gray-500 font-medium">Secondary IMEI</span>
                    <span className="font-bold font-mono text-gray-900">{formData.imei2}</span>
                  </div>
                )}
                <div className="flex justify-end pt-1">
                   <div className="flex gap-2">
                     <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold ${formData.riskLevel === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                       RISK: {formData.riskLevel || 'LOW'}
                     </span>
                     <span className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-700">
                       STATUS: {formData.imeiStatus || 'NEW'}
                     </span>
                   </div>
                </div>
              </div>
            </div>
          </div>

          {/* Photographic Evidence */}
          <div className="mb-8">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Camera className="w-4 h-4 text-emerald-600" /> Photographic Evidence
            </h2>
            <div className="grid grid-cols-4 gap-4">
              {[
                { title: 'Seller Photo', src: formData.sellerPhoto },
                { title: 'ID Document', src: formData.idCardPhoto },
                { title: 'Device (Front)', src: formData.deviceImg1 },
                { title: 'Device (Back)', src: formData.deviceImg2 },
              ].map((item, idx) => (
                <div key={idx} className="border border-gray-200 rounded-xl p-2 bg-gray-50 flex flex-col items-center">
                  {item.src ? (
                    <img src={item.src} className="w-full h-36 object-cover rounded-lg shadow-sm mb-3 border border-gray-200" alt={item.title} crossOrigin="anonymous" />
                  ) : (
                    <div className="w-full h-36 bg-gray-200 rounded-lg flex items-center justify-center mb-3">
                      <span className="text-xs font-medium text-gray-400">No Image</span>
                    </div>
                  )}
                  <p className="text-[10px] font-bold text-gray-600 uppercase text-center tracking-wide">{item.title}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Attestation and Signature */}
          <div className="border-t-2 border-gray-100 pt-8 flex gap-8 items-end">
            <div className="flex-1 bg-gray-50/80 p-5 rounded-2xl border border-gray-200">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Attestation Statement</h3>
              <p className="text-xs text-gray-700 leading-relaxed italic">
                "I, <span className="font-bold text-gray-900 border-b border-gray-400 px-1">{formData.sellerName || 'the undersigned'}</span>, hereby attest that the device described in this record is my legal property and I have the lawful right to transfer its ownership. I accept full legal responsibility for the accuracy of the information provided and acknowledge that Trusela and its authorized agents may verify this information with relevant authorities if necessary."
              </p>
            </div>
            <div className="w-72 flex flex-col items-center">
              {formData.signature ? (
                <img src={formData.signature} className="w-full h-24 object-contain border-b-2 border-gray-400 mb-3" alt="Signature" crossOrigin="anonymous" />
              ) : (
                <div className="w-full h-24 border-b-2 border-gray-400 mb-3 flex items-end justify-center pb-2">
                  <span className="text-gray-300 text-sm italic">No signature provided</span>
                </div>
              )}
              <p className="font-bold text-gray-900 text-sm uppercase tracking-wide">Seller Signature</p>
              <p className="text-[10px] font-medium text-gray-500 mt-1">Signed on {new Date().toLocaleDateString()}</p>
            </div>
          </div>
          
        </div>
      </div>

      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
            <div className="p-4 bg-navy text-white flex justify-between items-center">
              <h3 className="font-bold">Scan IMEI Barcode</h3>
              <button onClick={() => setShowScanner(false)} className="p-2 hover:bg-white/10 rounded-full">
                <AlertCircle className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div id="reader" className="w-full"></div>
            <div className="p-4 text-center text-xs text-gray-500">
              Point your camera at the IMEI barcode on the device or box.
            </div>
          </div>
        </div>
      )}

      {capturing && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
          <video ref={videoRef} autoPlay playsInline className="w-full max-h-[70vh] rounded-2xl bg-gray-900" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="mt-8 flex gap-4">
            <button onClick={stopCamera} className="btn-primary bg-red-500">Cancel</button>
            <button onClick={capturePhoto} className="btn-secondary px-8 py-4 text-xl">Capture</button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Step Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`flex-1 h-2 rounded-full ${step >= s ? 'bg-navy' : 'bg-gray-200'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4 animate-in slide-in-from-right duration-300">
            <h3 className="text-lg font-bold text-navy flex items-center gap-2">
              <User className="w-5 h-5" /> Seller Information
            </h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="sellerName" className="text-[10px] font-bold text-gray-400 uppercase">Full Name</label>
                <input
                  id="sellerName"
                  name="sellerName"
                  className="input-field"
                  placeholder="Full Name"
                  value={formData.sellerName}
                  onChange={e => setFormData({ ...formData, sellerName: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="phoneNumber" className="text-[10px] font-bold text-gray-400 uppercase">Phone Number</label>
                <input
                  id="phoneNumber"
                  name="phoneNumber"
                  className="input-field"
                  placeholder="Phone Number"
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="address" className="text-[10px] font-bold text-gray-400 uppercase">Residential Address</label>
                <textarea
                  id="address"
                  name="address"
                  className="input-field min-h-[100px]"
                  placeholder="Residential Address"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Seller Photo</p>
                  {formData.sellerPhoto ? (
                    <div className="relative rounded-xl overflow-hidden aspect-square">
                      <img src={formData.sellerPhoto} className="w-full h-full object-cover" alt="Seller" />
                      <button onClick={() => startCamera('sellerPhoto')} className="absolute bottom-2 right-2 bg-white/80 p-2 rounded-lg text-navy">
                        <Camera className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startCamera('sellerPhoto')} className="w-full border-2 border-dashed border-gray-300 rounded-xl aspect-square flex flex-col items-center justify-center gap-2 text-gray-500">
                      <Camera className="w-6 h-6" />
                      <span className="text-[10px]">Seller Photo</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">ID Card Photo</p>
                  {formData.idCardPhoto ? (
                    <div className="relative rounded-xl overflow-hidden aspect-square">
                      <img src={formData.idCardPhoto} className="w-full h-full object-cover" alt="ID Card" />
                      <button onClick={() => startCamera('idCardPhoto')} className="absolute bottom-2 right-2 bg-white/80 p-2 rounded-lg text-navy">
                        <Camera className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startCamera('idCardPhoto')} className="w-full border-2 border-dashed border-gray-300 rounded-xl aspect-square flex flex-col items-center justify-center gap-2 text-gray-500">
                      <Camera className="w-6 h-6" />
                      <span className="text-[10px]">ID Card Photo</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button onClick={() => setStep(2)} className="w-full btn-primary py-4 mt-4">Next: Device Info</button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-in slide-in-from-right duration-300">
            <h3 className="text-lg font-bold text-navy flex items-center gap-2">
              <Smartphone className="w-5 h-5" /> Device Information
            </h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="brand" className="text-[10px] font-bold text-gray-400 uppercase">Brand Name</label>
                <input
                  id="brand"
                  name="brand"
                  className="input-field"
                  placeholder="Brand Name (e.g. Samsung)"
                  value={formData.brand}
                  onChange={e => setFormData({ ...formData, brand: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="model" className="text-[10px] font-bold text-gray-400 uppercase">Model Number</label>
                <input
                  id="model"
                  name="model"
                  className="input-field"
                  placeholder="Model Number (e.g. S21 Ultra)"
                  value={formData.model}
                  onChange={e => setFormData({ ...formData, model: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label htmlFor="imei1" className="text-[10px] font-bold text-gray-400 uppercase">IMEI 1</label>
                    <input
                      id="imei1"
                      name="imei1"
                      className="input-field w-full"
                      placeholder="IMEI 1"
                      value={formData.imei1}
                      onChange={e => setFormData({ ...formData, imei1: e.target.value })}
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="bg-navy text-white p-4 rounded-xl hover:bg-navy/90 transition-colors self-end"
                  >
                    <Scan className="w-6 h-6" />
                  </button>
                </div>

                {isPremium ? (
                  <button 
                    onClick={verifyIMEI}
                    disabled={verifying || !formData.imei1}
                    className="w-full py-2 px-4 bg-yellow/10 text-navy border border-yellow/30 rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-yellow/20 transition-colors disabled:opacity-50"
                  >
                    {verifying ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                    Verify IMEI Security Status
                  </button>
                ) : (
                  <div className="p-3 bg-gray-100 rounded-lg flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 font-medium">IMEI Verification is Premium</span>
                    <Link to="/subscription" className="text-[10px] text-navy font-bold underline">Upgrade</Link>
                  </div>
                )}

                {imeiVerification && (
                  <div className={`p-4 rounded-xl border-2 flex items-start gap-3 animate-in zoom-in-95 duration-200 ${
                    imeiVerification.risk === 'HIGH' ? 'bg-red-50 border-red-200' :
                    imeiVerification.risk === 'MEDIUM' ? 'bg-orange-50 border-orange-200' :
                    'bg-green-50 border-green-200'
                  }`}>
                    {imeiVerification.risk === 'HIGH' ? <ShieldAlert className="w-6 h-6 text-red-600 shrink-0" /> :
                     imeiVerification.risk === 'MEDIUM' ? <ShieldQuestion className="w-6 h-6 text-orange-600 shrink-0" /> :
                     <ShieldCheck className="w-6 h-6 text-green-600 shrink-0" />}
                    <div>
                      <p className={`font-bold text-sm ${
                        imeiVerification.risk === 'HIGH' ? 'text-red-700' :
                        imeiVerification.risk === 'MEDIUM' ? 'text-orange-700' :
                        'text-green-700'
                      }`}>
                        {imeiVerification.status}: {imeiVerification.risk} RISK
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">{imeiVerification.message}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="imei2" className="text-[10px] font-bold text-gray-400 uppercase">IMEI 2 (Optional)</label>
                <input
                  id="imei2"
                  name="imei2"
                  className="input-field"
                  placeholder="IMEI 2 (Optional)"
                  value={formData.imei2}
                  onChange={e => setFormData({ ...formData, imei2: e.target.value })}
                />
              </div>

                <div className="p-4 rounded-xl border-2 flex items-start gap-3 animate-in zoom-in-95 duration-200 bg-gray-50 border-gray-200">
                <Package className="text-gray-400 w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <label htmlFor="deviceStatus" className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Device Status</label>
                  <select
                    id="deviceStatus"
                    name="deviceStatus"
                    className="w-full bg-transparent text-sm font-bold text-navy focus:outline-none"
                    value={formData.deviceStatus}
                    onChange={(e) => setFormData({ ...formData, deviceStatus: e.target.value })}
                  >
                    <option value="IN_STOCK">In Stock</option>
                    <option value="SOLD">Sold</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700">Front View</p>
                    {formData.deviceImg1 ? (
                      <img src={formData.deviceImg1} className="w-full aspect-square object-cover rounded-xl" onClick={() => startCamera('deviceImg1')} alt="Front View" />
                    ) : (
                      <button onClick={() => startCamera('deviceImg1')} className="w-full aspect-square border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400">
                        <Camera className="w-6 h-6" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700">Back View</p>
                    {formData.deviceImg2 ? (
                      <img src={formData.deviceImg2} className="w-full aspect-square object-cover rounded-xl" onClick={() => startCamera('deviceImg2')} alt="Back View" />
                    ) : (
                      <button onClick={() => startCamera('deviceImg2')} className="w-full aspect-square border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400">
                        <Camera className="w-6 h-6" />
                      </button>
                    )}
                  </div>
                </div>
            </div>
            <div className="flex gap-4 mt-4">
              <button onClick={() => setStep(1)} className="flex-1 bg-gray-200 text-gray-700 py-4 rounded-xl font-medium">Back</button>
              <button onClick={() => setStep(3)} className="flex-1 btn-primary py-4">Next: Review</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <h3 className="text-lg font-bold text-navy flex items-center gap-2">
              <CheckCircle className="w-5 h-5" /> Final Review
            </h3>
            
            <div className="card space-y-4">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Seller</span>
                <span className="font-bold">{formData.sellerName}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Device</span>
                <span className="font-bold">{formData.brand} {formData.model}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">IMEI 1</span>
                <span className="font-mono text-xs">{formData.imei1}</span>
              </div>
              
              <div className="pt-2">
                <p className="text-xs text-gray-400 mb-2 uppercase font-bold tracking-wider">Captured Images</p>
                <div className="grid grid-cols-5 gap-2">
                  {formData.sellerPhoto && (
                    <img src={formData.sellerPhoto} className="w-full aspect-[3/4] object-cover rounded-lg border" alt="Seller" />
                  )}
                  {formData.idCardPhoto && (
                    <img src={formData.idCardPhoto} className="w-full aspect-[3/4] object-cover rounded-lg border" alt="ID" />
                  )}
                  {formData.deviceImg1 && (
                    <img src={formData.deviceImg1} className="w-full aspect-[3/4] object-cover rounded-lg border" alt="Front" />
                  )}
                  {formData.deviceImg2 && (
                    <img src={formData.deviceImg2} className="w-full aspect-[3/4] object-cover rounded-lg border" alt="Back" />
                  )}
                  {formData.signature && (
                    <img src={formData.signature} className="w-full aspect-[3/4] object-contain bg-gray-50 rounded-lg border" alt="Sig" />
                  )}
                </div>
              </div>

              <div className="pt-4 border-t">
                <SignaturePad onSave={(sig) => setFormData(prev => ({ ...prev, signature: sig }))} />
              </div>
            </div>

            <label htmlFor="confirmed" className="flex items-start gap-3 p-4 bg-yellow/10 rounded-xl border border-yellow/20 cursor-pointer">
              <input
                id="confirmed"
                name="confirmed"
                type="checkbox"
                className="mt-1 w-5 h-5 rounded border-gray-300 text-navy focus:ring-navy"
                checked={formData.confirmed}
                onChange={e => setFormData({ ...formData, confirmed: e.target.checked })}
              />
              <span className="text-sm font-medium text-navy">
                I confirm this device is not stolen to my knowledge and I have verified the seller's identity.
              </span>
            </label>

            <div className="flex gap-4">
              <button onClick={() => setStep(2)} className="flex-1 bg-gray-200 text-gray-700 py-4 rounded-xl font-medium">Back</button>
              <button onClick={handleSave} disabled={loading || !formData.signature} className="flex-1 btn-primary py-4 flex items-center justify-center gap-2">
                {loading ? 'Saving...' : (
                  <>
                    <Save className="w-5 h-5" /> Save Record
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
