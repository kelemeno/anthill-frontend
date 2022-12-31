// import * as React from 'react';
import React from 'react';

import * as client from 'react-dom/client';
import {AppInner} from './App';


import './index.css';

const doc = document.getElementById('root')
const root = client.createRoot(doc!);

root.render(
    <React.StrictMode>
        <AppInner/>
    </React.StrictMode>
);