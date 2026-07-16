import React from 'react';
const Footer: React.FC = () => {
  const year = new Date().getFullYear();
  return (
    <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(0,0,0,0.45)' }}>
      批掌柜 BulkDesk ©{year}
    </div>
  );
};
export default Footer;
