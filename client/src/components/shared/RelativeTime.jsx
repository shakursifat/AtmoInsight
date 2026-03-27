export default function RelativeTime({ timestamp, className = '' }) {
  if (!timestamp) return <span className={className}>Unknown</span>;
  
  const diffInSeconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
  
  let label = 'just now';
  if (diffInSeconds >= 31536000) label = `${Math.floor(diffInSeconds / 31536000)} years ago`;
  else if (diffInSeconds >= 2592000) label = `${Math.floor(diffInSeconds / 2592000)} months ago`;
  else if (diffInSeconds >= 86400) label = `${Math.floor(diffInSeconds / 86400)} days ago`;
  else if (diffInSeconds >= 3600) label = `${Math.floor(diffInSeconds / 3600)} hours ago`;
  else if (diffInSeconds >= 60) label = `${Math.floor(diffInSeconds / 60)} mins ago`;
  else if (diffInSeconds > 0) label = `${diffInSeconds} secs ago`;

  return <span className={`font-data ${className}`}>{label}</span>;
}
