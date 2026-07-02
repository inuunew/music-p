import React from 'react';

const ApiResultCard = ({ title, data, renderCustom }) => {
  if (!data) return null;

  return (
    <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '6px', backgroundColor: '#f9f9f9' }}>
      <h3 style={{ marginTop: 0, color: '#333' }}>{title}</h3>
      <pre style={{ 
        fontSize: '12px', 
        overflowX: 'auto', 
        background: '#272822', 
        color: '#f8f8f2', 
        padding: '12px', 
        borderRadius: '4px',
        maxHeight: '250px'
      }}>
        {renderCustom ? renderCustom(data) : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

export default ApiResultCard;
