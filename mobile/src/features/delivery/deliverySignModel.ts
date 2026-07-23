export type DeliverySignState = {
  signerName: string;
  proofImageUrls: string[];
  signatureImageUrl?: string | null;
  collectPayment: boolean;
  paidAmount?: number;
  paymentProofImageUrls: string[];
  remark?: string | null;
};

export function createDeliverySignState(): DeliverySignState {
  return {
    collectPayment: false,
    proofImageUrls: [],
    signerName: '',
    paymentProofImageUrls: [],
  };
}

export function validateSignPayload(state: DeliverySignState): string | null {
  if (!state.signerName.trim()) {
    return '请填写签收人姓名';
  }
  if (!state.proofImageUrls.length) {
    return '请至少拍摄一张现场照片';
  }
  if (!state.signatureImageUrl?.trim()) {
    return '请完成手写签名';
  }
  if (state.collectPayment && (!state.paidAmount || state.paidAmount <= 0)) {
    return '请填写实收金额';
  }
  if (state.collectPayment && !state.paymentProofImageUrls.length) {
    return '请至少拍摄一张付款凭证';
  }
  return null;
}

export function canSubmitDeliverySign(state: DeliverySignState): boolean {
  return validateSignPayload(state) === null;
}

export function toDeliverySignInput(state: DeliverySignState) {
  return {
    signer_name: state.signerName.trim(),
    proof_image_urls: state.proofImageUrls,
    signature_image_url: state.signatureImageUrl ?? null,
    remark: state.remark ?? null,
    collect_payment: state.collectPayment,
    paid_amount: state.paidAmount,
    payment_proof_image_urls: state.paymentProofImageUrls,
  };
}
