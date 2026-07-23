import { canSubmitDeliverySign, createDeliverySignState, toDeliverySignInput, validateSignPayload } from '../features/delivery/deliverySignModel';

describe('delivery sign model', () => {
  it('returns user-readable validation messages for incomplete sign payloads', () => {
    expect(validateSignPayload({ signerName: '', proofImageUrls: ['https://x/proof.jpg'], signatureImageUrl: 'https://x/sign.png', collectPayment: false, paymentProofImageUrls: [] })).toBe('请填写签收人姓名');
    expect(validateSignPayload({ signerName: '张三', proofImageUrls: [], signatureImageUrl: 'https://x/sign.png', collectPayment: false, paymentProofImageUrls: [] })).toBe('请至少拍摄一张现场照片');
    expect(validateSignPayload({ signerName: '张三', proofImageUrls: ['https://x/proof.jpg'], signatureImageUrl: null, collectPayment: false, paymentProofImageUrls: [] })).toBe('请完成手写签名');
    expect(validateSignPayload({ signerName: '张三', proofImageUrls: ['https://x/proof.jpg'], signatureImageUrl: 'https://x/sign.png', collectPayment: true, paidAmount: 0, paymentProofImageUrls: [] })).toBe('请填写实收金额');
    expect(validateSignPayload({ signerName: '张三', proofImageUrls: ['https://x/proof.jpg'], signatureImageUrl: 'https://x/sign.png', collectPayment: true, paidAmount: 88, paymentProofImageUrls: [] })).toBe('请至少拍摄一张付款凭证');
  });

  it('requires signer, proof photo, signature and payment proof when collecting payment', () => {
    const state = createDeliverySignState();
    expect(canSubmitDeliverySign(state)).toBe(false);
    expect(canSubmitDeliverySign({ ...state, signerName: '张三' })).toBe(false);
    expect(canSubmitDeliverySign({ ...state, signerName: '张三', proofImageUrls: ['proof'] })).toBe(false);
    expect(canSubmitDeliverySign({ ...state, signerName: '张三', proofImageUrls: ['proof'], signatureImageUrl: 'signature' })).toBe(true);
    expect(canSubmitDeliverySign({ ...state, signerName: '张三', proofImageUrls: ['proof'], signatureImageUrl: 'signature', collectPayment: true, paidAmount: 100 })).toBe(false);
    expect(canSubmitDeliverySign({ ...state, signerName: '张三', proofImageUrls: ['proof'], signatureImageUrl: 'signature', collectPayment: true, paidAmount: 100, paymentProofImageUrls: ['url'] })).toBe(true);
  });

  it('serializes mobile signature and proof fields', () => {
    expect(
      toDeliverySignInput({
        signerName: ' 张三 ',
        proofImageUrls: ['proof'],
        signatureImageUrl: 'signature',
        collectPayment: false,
        paymentProofImageUrls: [],
      }),
    ).toMatchObject({ signer_name: '张三', proof_image_urls: ['proof'], signature_image_url: 'signature' });
  });
});
