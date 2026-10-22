import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionUser, verifyCsrfAndOrigin } from '@/lib/auth-server';

export async function POST(request: Request) {
  try {
    // 1. CSRF and Origin verification
    const csrfCheck = verifyCsrfAndOrigin(request);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { success: false, message: csrfCheck.reason || 'CSRF validation failed.' },
        { status: 403 }
      );
    }

    // 2. Session authentication check
    const auth = await getSessionUser(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, message: 'Authentication required.' },
        { status: 401 }
      );
    }

    // 3. Role authorization check (only store owner can upload product images)
    if (auth.user.role !== 'owner') {
      return NextResponse.json(
        { success: false, message: 'Only store owners are authorized to upload product images.' },
        { status: 403 }
      );
    }

    // 4. Resolve Cloudinary credentials from server environment
    let cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    let apiKey = process.env.CLOUDINARY_API_KEY;
    let apiSecret = process.env.CLOUDINARY_API_SECRET;

    if ((!cloudName || !apiKey || !apiSecret) && process.env.CLOUDINARY_URL) {
      try {
        const parsed = new URL(process.env.CLOUDINARY_URL);
        cloudName = parsed.hostname;
        apiKey = parsed.username;
        apiSecret = parsed.password;
      } catch {
        // Ignore URL parse error; will be caught in the check below
      }
    }

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Cloudinary is not configured on this server. Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET (or CLOUDINARY_URL) in your server environment.',
        },
        { status: 503 }
      );
    }

    // 5. Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, message: 'No image file provided for upload.' },
        { status: 400 }
      );
    }

    // 6. Validate file MIME type
    const mimeType = file.type.toLowerCase();
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
    if (!allowedMimeTypes.includes(mimeType)) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Unsupported image format. Allowed formats: JPEG, PNG, WebP, GIF, or AVIF.',
        },
        { status: 400 }
      );
    }

    // 7. Validate file size (max 5MB)
    const MAX_SIZE_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, message: 'Image size exceeds the maximum allowed limit of 5MB.' },
        { status: 400 }
      );
    }

    // 8. Generate timestamp and signature for secure Cloudinary REST upload
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'nexora_products';

    // Cloudinary signature parameters must be sorted alphabetically
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

    const cloudinaryFormData = new FormData();
    cloudinaryFormData.append('file', file);
    cloudinaryFormData.append('api_key', apiKey);
    cloudinaryFormData.append('timestamp', String(timestamp));
    cloudinaryFormData.append('signature', signature);
    cloudinaryFormData.append('folder', folder);

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      {
        method: 'POST',
        body: cloudinaryFormData,
      }
    );

    const data = await uploadResponse.json();

    if (!uploadResponse.ok) {
      const errorMsg = data?.error?.message || 'Failed to upload image to Cloudinary.';
      return NextResponse.json(
        { success: false, message: errorMsg },
        { status: uploadResponse.status >= 400 && uploadResponse.status < 500 ? 400 : 502 }
      );
    }

    if (!data.secure_url) {
      return NextResponse.json(
        { success: false, message: 'Cloudinary did not return a secure URL for the uploaded image.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      url: data.secure_url,
    });
  } catch (error: any) {
    console.error('Product image upload failed:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Internal error while uploading image.' },
      { status: 500 }
    );
  }
}
