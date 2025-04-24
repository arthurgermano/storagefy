var r,i;function u(){if(i)return r;i=1;function t(n,e=!0,o=!1){return new Promise((s,p)=>{setTimeout(()=>{o&&p(e===!0?new Error("Sleep Error"):e),s(e)},n)})}return r=t,r}export{u as r};
